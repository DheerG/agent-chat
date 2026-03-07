import { describe, test } from 'vitest';

// These tests will be implemented in Plan 02 (Wave 1) when schema.ts and db/index.ts exist.
// Stubs use test.todo() — they show as "todo" not failures.

describe('Schema — table structure', () => {
  test.todo('all 4 tables exist: tenants, channels, messages, presence');
  test.todo('WAL mode is active after DB initialization');
  test.todo('composite index exists on messages(tenant_id, channel_id, id)');
  test.todo('thread index exists on messages(parent_message_id) WHERE NOT NULL');
});
