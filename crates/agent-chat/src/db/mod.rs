pub mod queries;

use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::{Arc, Mutex};

// ─── Future Schema Direction ───────────────────────────────────────
//
// The current schema stores messages as flat rows with sender info inlined.
// The long-term goal is a proper relational model with four key entities:
//
//   1. members       — team participants (agent or human, any CLI)
//   2. messages      — a single message authored by one member
//   3. recipients    — members who received the message
//   4. message_recipients — mapping table (message_id, recipient_id)
//
// This enables:
//   - Showing "principal-engineer → everyone" vs "principal-engineer → team-lead"
//     in the UI, making conversation flow transparent without guesswork.
//   - Deduplicating broadcasts at the data model level instead of the watcher.
//   - Extending beyond Claude Code — any CLI that produces agent team sessions
//     (custom agents, other AI tools) can write to the same schema.
//
// The current `metadata.recipient` field on messages is a stepping stone.
// When this schema evolves, the `recipient` field should migrate to the
// message_recipients mapping table, and sender info should reference the
// members table rather than being inlined as sender_id/sender_name/sender_type.
// ────────────────────────────────────────────────────────────────────

const CREATE_TABLES_SQL: &str = r#"
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workspace_path TEXT,
    workspace_name TEXT,
    type TEXT NOT NULL DEFAULT 'team',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    agent_name TEXT,
    agent_type TEXT,
    model TEXT,
    cwd TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    parent_session_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    parent_message_id TEXT,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    -- event_time = the message's real send/delivery time from the transcript
    -- (NOT the ingestion time). The feed orders on this so a transcript
    -- backfill renders in true chronological order instead of read order.
    event_time TEXT,
    -- source_key = stable per-record identity (owner_session:line_uuid:ordinal).
    -- A UNIQUE index makes ingestion idempotent and restart-safe: re-reading a
    -- transcript can never double-insert, regardless of offset bookkeeping.
    source_key TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(parent_message_id);
  CREATE INDEX IF NOT EXISTS idx_messages_event ON messages(conversation_id, event_time, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_source_key ON messages(source_key) WHERE source_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS conversation_summaries (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
    total_messages INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT,
    last_message_preview TEXT,
    last_message_sender TEXT,
    active_session_count INTEGER NOT NULL DEFAULT 0,
    total_session_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT NOT NULL
  );

  -- Per-transcript-file ingestion progress. Byte offset into an append-only
  -- JSONL transcript, persisted so a server restart resumes instead of
  -- re-emitting history. Correctness still rests on messages.source_key; this
  -- is purely the efficiency cursor.
  CREATE TABLE IF NOT EXISTS ingest_files (
    path TEXT PRIMARY KEY,
    conversation_id TEXT,
    owner_name TEXT,
    byte_offset INTEGER NOT NULL DEFAULT 0,
    file_size INTEGER NOT NULL DEFAULT 0,
    last_event_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ingest_files_conversation ON ingest_files(conversation_id);
"#;

/// Columns added after the initial release. Applied idempotently on open so
/// existing user databases gain the new ordering/idempotency fields without a
/// migration framework. (path, column, definition)
const ADD_COLUMNS: &[(&str, &str, &str)] = &[
    ("messages", "event_time", "TEXT"),
    ("messages", "source_key", "TEXT"),
];

/// Thread-safe database handle wrapping a SQLite connection behind a Mutex.
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        conn.execute_batch(CREATE_TABLES_SQL)?;
        Self::apply_column_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(CREATE_TABLES_SQL)?;
        Self::apply_column_migrations(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Add post-release columns to pre-existing databases. Idempotent: skips any
    /// column that already exists, so it is safe to run on every open.
    fn apply_column_migrations(conn: &Connection) -> Result<()> {
        for (table, column, def) in ADD_COLUMNS {
            let exists: bool = conn
                .prepare(&format!("PRAGMA table_info({table})"))?
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(|r| r.ok())
                .any(|name| name == *column);
            if !exists {
                conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {def};"))?;
            }
        }
        // Indexes that depend on the migrated columns (no-op if already present).
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_messages_event ON messages(conversation_id, event_time, id);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_source_key ON messages(source_key) WHERE source_key IS NOT NULL;",
        )?;
        Ok(())
    }

    /// Execute a closure with exclusive access to the connection.
    pub fn with_conn<F, T>(&self, f: F) -> T
    where
        F: FnOnce(&Connection) -> T,
    {
        let conn = self.conn.lock().expect("db lock poisoned");
        f(&conn)
    }
}
