import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { createDb, type DbInstance } from '../index.js';
import { WriteQueue } from '../queue.js';

describe('Write serialization queue', () => {
  let instance: DbInstance;
  let queue: WriteQueue;

  beforeEach(() => {
    instance = createDb(':memory:');
    queue = new WriteQueue();

    // Seed: create tenant and channel for write tests
    const tenantId = ulid();
    const channelId = ulid();
    const now = new Date().toISOString();

    instance.rawDb.prepare(`
      INSERT INTO tenants (id, name, codebase_path, created_at)
      VALUES (?, ?, ?, ?)
    `).run(tenantId, 'Test Tenant', '/tmp/test', now);

    instance.rawDb.prepare(`
      INSERT INTO channels (id, tenant_id, name, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(channelId, tenantId, 'general', 'manual', now, now);

    // Store on instance for test access
    (instance as DbInstance & { _testTenantId: string; _testChannelId: string })._testTenantId = tenantId;
    (instance as DbInstance & { _testTenantId: string; _testChannelId: string })._testChannelId = channelId;
  });

  afterEach(() => {
    instance.close();
  });

  test('50 concurrent writes complete without SQLITE_BUSY error', async () => {
    const { _testTenantId: tenantId, _testChannelId: channelId } = instance as DbInstance & { _testTenantId: string; _testChannelId: string };

    const insert = instance.rawDb.prepare(`
      INSERT INTO messages (id, channel_id, tenant_id, sender_id, sender_name, sender_type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const writes = Array.from({ length: 50 }, (_, i) =>
      queue.enqueue(() =>
        insert.run(
          ulid(),
          channelId,
          tenantId,
          'agent-1',
          'Test Agent',
          'agent',
          `Message ${i}`,
          new Date().toISOString()
        )
      )
    );

    await expect(Promise.all(writes)).resolves.toHaveLength(50);

    const count = (instance.rawDb.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n;
    expect(count).toBe(50);
  });

  test('writes are serialized — queue processes one at a time', async () => {
    const order: number[] = [];

    const tasks = [1, 2, 3].map((n) =>
      queue.enqueue(() => {
        order.push(n);
        return n;
      })
    );

    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  test('failed write rejects the promise, does not block subsequent writes', async () => {
    // Enqueue a failing write followed by a successful write.
    // The queue must continue processing after a failure.
    const failResult = await queue.enqueue<void>(() => {
      throw new Error('intentional failure');
    }).then(() => 'resolved' as const).catch(() => 'rejected' as const);

    const successResult = await queue.enqueue(() => 'success' as const);

    expect(failResult).toBe('rejected');
    expect(successResult).toBe('success');
  });
});
