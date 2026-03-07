import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createDb, type DbInstance } from '../index.js';
import { WriteQueue } from '../queue.js';
import { createTenantQueries } from '../queries/tenants.js';
import { createChannelQueries } from '../queries/channels.js';
import { createMessageQueries } from '../queries/messages.js';

describe('Tenant isolation', () => {
  let instance: DbInstance;
  let queue: WriteQueue;

  beforeEach(() => {
    instance = createDb(':memory:');
    queue = new WriteQueue();
  });

  afterEach(() => {
    instance.close();
  });

  test('message written under tenant A is invisible when queried under tenant B', async () => {
    const tenantQ = createTenantQueries(instance, queue);
    const channelQ = createChannelQueries(instance, queue);
    const messageQ = createMessageQueries(instance, queue);

    const tenantA = await tenantQ.insertTenant({ name: 'Tenant A', codebasePath: '/project-a' });
    const tenantB = await tenantQ.insertTenant({ name: 'Tenant B', codebasePath: '/project-b' });

    const channelA = await channelQ.insertChannel(tenantA.id, { name: 'general' });
    const channelB = await channelQ.insertChannel(tenantB.id, { name: 'general' });

    // Write message under tenant A
    await messageQ.insertMessage(tenantA.id, {
      channelId: channelA.id,
      senderId: 'agent-1',
      senderName: 'Agent 1',
      senderType: 'agent',
      content: 'Secret message for tenant A only',
    });

    // Query under tenant B — must return 0 messages
    const tenantBMessages = messageQ.getMessages(tenantB.id, channelB.id);
    expect(tenantBMessages).toHaveLength(0);

    // Tenant A can read its own message
    const tenantAMessages = messageQ.getMessages(tenantA.id, channelA.id);
    expect(tenantAMessages).toHaveLength(1);
    expect(tenantAMessages[0].content).toBe('Secret message for tenant A only');
  });

  test('channel created under tenant A is not returned in tenant B channel list', async () => {
    const tenantQ = createTenantQueries(instance, queue);
    const channelQ = createChannelQueries(instance, queue);

    const tenantA = await tenantQ.insertTenant({ name: 'Tenant A', codebasePath: '/proj-a' });
    const tenantB = await tenantQ.insertTenant({ name: 'Tenant B', codebasePath: '/proj-b' });

    await channelQ.insertChannel(tenantA.id, { name: 'tenant-a-only-channel' });

    const tenantBChannels = channelQ.getChannelsByTenant(tenantB.id);
    expect(tenantBChannels).toHaveLength(0);
  });

  test('tenant_id is required parameter — TypeScript enforces at compile time', () => {
    // This documents the API contract enforced by TypeScript.
    // getMessages(channelId) without tenantId would be a compile error.
    // At runtime: calling with a non-existent tenantId returns empty array (no leak).
    const messageQ = createMessageQueries(instance, queue);
    const result = messageQ.getMessages('nonexistent-tenant-id', 'nonexistent-channel-id');
    expect(result).toEqual([]);
  });
});
