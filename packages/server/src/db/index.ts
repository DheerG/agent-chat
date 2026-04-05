import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import * as path from 'path';
import * as schema from '@agent-chat/shared';
import { getDbPath } from './config.js';

const CREATE_TABLES_SQL = `
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
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(parent_message_id);

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

`;

export interface DbInstance {
  db: ReturnType<typeof drizzle<typeof schema>>;
  rawDb: Database.Database;
  close: () => void;
}

export function createDb(dbPath: string = getDbPath()): DbInstance {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const rawDb = new Database(dbPath);

  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('busy_timeout = 5000');
  rawDb.pragma('synchronous = NORMAL');
  rawDb.pragma('foreign_keys = ON');

  rawDb.exec(CREATE_TABLES_SQL);

  const db = drizzle(rawDb, { schema });

  return {
    db,
    rawDb,
    close: () => rawDb.close(),
  };
}

let _instance: DbInstance | null = null;

export function getDb(): DbInstance {
  if (!_instance) {
    _instance = createDb();
  }
  return _instance;
}

export function closeDb(): void {
  _instance?.close();
  _instance = null;
}
