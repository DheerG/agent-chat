import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../index.js';
import { WriteQueue } from '../queue.js';
import { createServices } from '../../services/index.js';
import type { DbInstance } from '../index.js';
import type { Services } from '../../services/index.js';
import { createMessageQueries } from '../queries/messages.js';

describe('CheckinService', () => {
  let instance: DbInstance;
  let services: Services;
  let tenantId: string;

  beforeEach(async () => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);

    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/project');
    tenantId = tenant.id;
  });

  afterEach(() => {
    instance.close();
  });

  describe('checkin()', () => {
    it('records first check-in with null previous value', async () => {
      const result = await services.checkins.checkin('agent-1', tenantId);
      expect(result.checkedInAt).toBeDefined();
      expect(result.previousCheckin).toBeNull();
    });

    it('returns previous check-in timestamp on subsequent calls', async () => {
      const first = await services.checkins.checkin('agent-1', tenantId);
      await new Promise(r => setTimeout(r, 15));
      const second = await services.checkins.checkin('agent-1', tenantId);

      expect(second.previousCheckin).toBe(first.checkedInAt);
      expect(second.checkedInAt).not.toBe(first.checkedInAt);
    });

    it('tracks separate check-ins per agent', async () => {
      await services.checkins.checkin('agent-1', tenantId);
      const result = await services.checkins.checkin('agent-2', tenantId);
      expect(result.previousCheckin).toBeNull();
    });

    it('tracks separate check-ins per tenant', async () => {
      const tenant2 = await services.tenants.upsertByCodebasePath('other', '/other');
      await services.checkins.checkin('agent-1', tenantId);
      const result = await services.checkins.checkin('agent-1', tenant2.id);
      expect(result.previousCheckin).toBeNull();
    });
  });

  describe('getLastCheckin()', () => {
    it('returns null when no check-in exists', () => {
      const result = services.checkins.getLastCheckin('unknown-agent', tenantId);
      expect(result).toBeNull();
    });

    it('returns last check-in timestamp', async () => {
      const checkin = await services.checkins.checkin('agent-1', tenantId);
      const result = services.checkins.getLastCheckin('agent-1', tenantId);
      expect(result).toBe(checkin.checkedInAt);
    });

    it('returns updated timestamp after second check-in', async () => {
      await services.checkins.checkin('agent-1', tenantId);
      await new Promise(r => setTimeout(r, 15));
      const second = await services.checkins.checkin('agent-1', tenantId);
      const result = services.checkins.getLastCheckin('agent-1', tenantId);
      expect(result).toBe(second.checkedInAt);
    });
  });
});

describe('Extended Message Queries', () => {
  let instance: DbInstance;
  let queue: WriteQueue;
  let services: Services;
  let tenantId: string;
  let channelId: string;
  let messageQ: ReturnType<typeof createMessageQueries>;

  beforeEach(async () => {
    instance = createDb(':memory:');
    queue = new WriteQueue();
    services = createServices(instance, queue);
    messageQ = createMessageQueries(instance, queue);

    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/project');
    tenantId = tenant.id;
    const channel = await services.channels.create(tenantId, { name: 'test-channel' });
    channelId = channel.id;
  });

  afterEach(() => {
    instance.close();
  });

  async function createMessage(senderId: string, content: string, channelOverride?: string) {
    return services.messages.send(tenantId, {
      channelId: channelOverride ?? channelId,
      senderId,
      senderName: senderId,
      senderType: 'agent',
      content,
    });
  }

  describe('getMessagesSince()', () => {
    it('returns messages after a timestamp in a channel', async () => {
      await createMessage('agent-1', 'before');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 15));
      await createMessage('agent-2', 'after');

      const result = messageQ.getMessagesSince(tenantId, channelId, since);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('after');
    });

    it('returns empty when no messages after timestamp', async () => {
      await createMessage('agent-1', 'before');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();

      const result = messageQ.getMessagesSince(tenantId, channelId, since);
      expect(result.length).toBe(0);
    });

    it('respects limit parameter', async () => {
      const since = new Date(Date.now() - 10000).toISOString();
      for (let i = 0; i < 5; i++) {
        await createMessage('agent-1', `msg-${i}`);
      }

      const result = messageQ.getMessagesSince(tenantId, channelId, since, 3);
      expect(result.length).toBe(3);
    });

    it('scopes to correct channel', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      const since = new Date(Date.now() - 10000).toISOString();
      await createMessage('agent-1', 'in-main');
      await createMessage('agent-1', 'in-other', ch2.id);

      const result = messageQ.getMessagesSince(tenantId, channelId, since);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('in-main');
    });
  });

  describe('getMessagesByTenantSince()', () => {
    it('returns messages across all channels for a tenant', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      const since = new Date(Date.now() - 10000).toISOString();
      await createMessage('agent-1', 'in-main');
      await createMessage('agent-1', 'in-other', ch2.id);

      const result = messageQ.getMessagesByTenantSince(tenantId, since);
      expect(result.length).toBe(2);
    });

    it('excludes messages from other tenants', async () => {
      const tenant2 = await services.tenants.upsertByCodebasePath('other', '/other');
      const ch2 = await services.channels.create(tenant2.id, { name: 'other-tenant-channel' });
      const since = new Date(Date.now() - 10000).toISOString();
      await createMessage('agent-1', 'in-tenant-1');
      await services.messages.send(tenant2.id, {
        channelId: ch2.id,
        senderId: 'agent-1',
        senderName: 'agent-1',
        senderType: 'agent',
        content: 'in-tenant-2',
      });

      const result = messageQ.getMessagesByTenantSince(tenantId, since);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('in-tenant-1');
    });

    it('respects limit parameter', async () => {
      const since = new Date(Date.now() - 10000).toISOString();
      for (let i = 0; i < 5; i++) {
        await createMessage('agent-1', `msg-${i}`);
      }

      const result = messageQ.getMessagesByTenantSince(tenantId, since, 3);
      expect(result.length).toBe(3);
    });
  });

  describe('getMessagesBySender()', () => {
    it('returns messages from a specific sender', async () => {
      await createMessage('agent-1', 'from-1');
      await createMessage('agent-2', 'from-2');
      await createMessage('agent-1', 'also-from-1');

      const result = messageQ.getMessagesBySender(tenantId, 'agent-1');
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('from-1');
      expect(result[1].content).toBe('also-from-1');
    });

    it('filters by channel', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      await createMessage('agent-1', 'in-main');
      await createMessage('agent-1', 'in-other', ch2.id);

      const result = messageQ.getMessagesBySender(tenantId, 'agent-1', { channelId });
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('in-main');
    });

    it('filters by since timestamp', async () => {
      await createMessage('agent-1', 'old');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 15));
      await createMessage('agent-1', 'new');

      const result = messageQ.getMessagesBySender(tenantId, 'agent-1', { since });
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('new');
    });

    it('returns empty when sender has no messages', () => {
      const result = messageQ.getMessagesBySender(tenantId, 'nonexistent');
      expect(result.length).toBe(0);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createMessage('agent-1', `msg-${i}`);
      }

      const result = messageQ.getMessagesBySender(tenantId, 'agent-1', { limit: 3 });
      expect(result.length).toBe(3);
    });

    it('combines channel and since filters', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      await createMessage('agent-1', 'old-main');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 15));
      await createMessage('agent-1', 'new-main');
      await createMessage('agent-1', 'new-other', ch2.id);

      const result = messageQ.getMessagesBySender(tenantId, 'agent-1', { since, channelId });
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('new-main');
    });
  });
});
