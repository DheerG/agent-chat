import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDb } from '../index.js';
import type { DbInstance } from '../index.js';

// NOTE: WAL mode requires a file-based DB — SQLite in-memory mode always
// uses 'memory' journal mode. Separate describe blocks handle this distinction.

describe('Schema — table structure (in-memory)', () => {
  let instance: DbInstance;

  beforeEach(() => {
    instance = createDb(':memory:');
  });

  afterEach(() => {
    instance.close();
  });

  test('all 4 tables exist: tenants, channels, messages, presence', () => {
    const tables = instance.rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('tenants');
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('presence');
  });

  test('composite index exists on messages(tenant_id, channel_id, id)', () => {
    const indexes = instance.rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_messages_tenant_channel');
  });

  test('thread index exists on messages(parent_message_id)', () => {
    const indexes = instance.rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_messages_thread');
  });
});

describe('Schema — WAL mode (file-based DB)', () => {
  let tmpDir: string;
  let instance: DbInstance;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-chat-wal-test-'));
    instance = createDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    instance.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('WAL mode is active after DB initialization', () => {
    // WAL mode only works on file-based DBs — :memory: always uses 'memory' mode
    const result = instance.rawDb.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');
  });
});
