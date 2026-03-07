import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDb, type DbInstance } from '../index.js';
import { WriteQueue } from '../queue.js';
import { createTenantQueries } from '../queries/tenants.js';
import { createChannelQueries } from '../queries/channels.js';
import { createMessageQueries } from '../queries/messages.js';

describe('Message persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-chat-persistence-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('message written to DB survives DB close and reopen', async () => {
    const dbPath = join(tmpDir, 'test.db');
    const queue = new WriteQueue();

    // Phase 1: Write and close
    let instance: DbInstance = createDb(dbPath);
    const tenantQ = createTenantQueries(instance, queue);
    const channelQ = createChannelQueries(instance, queue);
    const messageQ = createMessageQueries(instance, queue);

    const tenant = await tenantQ.insertTenant({ name: 'Persistent Tenant', codebasePath: '/persist-test' });
    const channel = await channelQ.insertChannel(tenant.id, { name: 'general' });
    const written = await messageQ.insertMessage(tenant.id, {
      channelId: channel.id,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'I should survive a restart',
    });

    instance.close();

    // Phase 2: Reopen and read
    instance = createDb(dbPath);
    const messageQ2 = createMessageQueries(instance, queue);

    const messages = messageQ2.getMessages(tenant.id, channel.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(written.id);
    expect(messages[0].content).toBe('I should survive a restart');

    instance.close();
  });

  test('ULID ordering: messages returned in lexicographic (insertion) order', async () => {
    const instance = createDb(':memory:');
    const queue = new WriteQueue();
    const tenantQ = createTenantQueries(instance, queue);
    const channelQ = createChannelQueries(instance, queue);
    const messageQ = createMessageQueries(instance, queue);

    const tenant = await tenantQ.insertTenant({ name: 'T', codebasePath: '/t' });
    const channel = await channelQ.insertChannel(tenant.id, { name: 'c' });

    // Insert sequentially with await — ULIDs generated at different times
    // are guaranteed to be lexicographically ordered (1ms timestamp resolution)
    const m1 = await messageQ.insertMessage(tenant.id, {
      channelId: channel.id,
      senderId: 's',
      senderName: 'S',
      senderType: 'agent',
      content: 'First',
    });
    // Small delay ensures unique ULID timestamps (ULID has 1ms resolution)
    await new Promise((r) => setTimeout(r, 2));
    const m2 = await messageQ.insertMessage(tenant.id, {
      channelId: channel.id,
      senderId: 's',
      senderName: 'S',
      senderType: 'agent',
      content: 'Second',
    });
    await new Promise((r) => setTimeout(r, 2));
    const m3 = await messageQ.insertMessage(tenant.id, {
      channelId: channel.id,
      senderId: 's',
      senderName: 'S',
      senderType: 'agent',
      content: 'Third',
    });

    const result = messageQ.getMessages(tenant.id, channel.id);
    expect(result.map((m) => m.content)).toEqual(['First', 'Second', 'Third']);

    // ULID lexicographic order = insertion order
    expect(result[0].id < result[1].id).toBe(true);
    expect(result[1].id < result[2].id).toBe(true);

    instance.close();
  });

  test('message metadata stored as JSON TEXT, parsed on read', async () => {
    const instance = createDb(':memory:');
    const queue = new WriteQueue();
    const tenantQ = createTenantQueries(instance, queue);
    const channelQ = createChannelQueries(instance, queue);
    const messageQ = createMessageQueries(instance, queue);

    const tenant = await tenantQ.insertTenant({ name: 'T', codebasePath: '/t2' });
    const channel = await channelQ.insertChannel(tenant.id, { name: 'c' });

    const metadata = { toolName: 'bash', exitCode: 0, duration: 1234, nested: { key: 'value' } };
    await messageQ.insertMessage(tenant.id, {
      channelId: channel.id,
      senderId: 's',
      senderName: 'Hook',
      senderType: 'hook',
      content: 'Tool execution result',
      messageType: 'hook',
      metadata,
    });

    const [result] = messageQ.getMessages(tenant.id, channel.id);
    expect(result.metadata).toEqual(metadata);
    expect(typeof result.metadata).toBe('object');
    expect(result.metadata['toolName']).toBe('bash');

    instance.close();
  });
});
