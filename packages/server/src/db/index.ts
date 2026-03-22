import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import * as path from 'path';
import * as schema from '@agent-chat/shared';
import { getDbPath } from './config.js';

// Raw SQL DDL — applied at startup to ensure tables exist.
// Using raw SQL instead of drizzle-kit push (which is a CLI tool, not a runtime API).
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    codebase_path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    session_id TEXT,
    type TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    parent_message_id TEXT REFERENCES messages(id),
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_tenant_channel ON messages(tenant_id, channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(parent_message_id);

  CREATE TABLE IF NOT EXISTS presence (
    agent_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    channel_id TEXT NOT NULL REFERENCES channels(id),
    status TEXT NOT NULL DEFAULT 'active',
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, tenant_id, channel_id)
  );

  CREATE INDEX IF NOT EXISTS idx_presence_tenant ON presence(tenant_id);

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'text',
    created_by_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_by_type TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_documents_tenant_channel ON documents(tenant_id, channel_id);

  CREATE TABLE IF NOT EXISTS checkins (
    agent_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    last_checkin_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, tenant_id)
  );
`;

export interface DbInstance {
  db: ReturnType<typeof drizzle<typeof schema>>;
  rawDb: Database.Database;
  close: () => void;
}

export function createDb(dbPath: string = getDbPath()): DbInstance {
  // Ensure parent directory exists (skip for in-memory DB)
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const rawDb = new Database(dbPath);

  // Configure SQLite pragmas — WAL mode MUST come first
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('busy_timeout = 5000');
  rawDb.pragma('synchronous = NORMAL');
  rawDb.pragma('foreign_keys = ON');

  // Apply schema DDL
  rawDb.exec(CREATE_TABLES_SQL);

  // Idempotent migrations — SQLite does not support IF NOT EXISTS for ALTER TABLE ADD COLUMN
  try { rawDb.exec('ALTER TABLE tenants ADD COLUMN archived_at TEXT'); } catch { /* column already exists */ }
  try { rawDb.exec('ALTER TABLE channels ADD COLUMN archived_at TEXT'); } catch { /* column already exists */ }
  try { rawDb.exec('ALTER TABLE channels ADD COLUMN user_archived TEXT'); } catch { /* column already exists */ }
  try { rawDb.exec('ALTER TABLE tenants ADD COLUMN user_archived TEXT'); } catch { /* column already exists */ }

  const db = drizzle(rawDb, { schema });

  return {
    db,
    rawDb,
    close: () => rawDb.close(),
  };
}

// Production singleton — lazily initialized
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
