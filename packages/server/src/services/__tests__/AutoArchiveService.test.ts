import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, type DbInstance } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices, type Services } from '../index.js';
import { AutoArchiveService } from '../AutoArchiveService.js';
import { EventEmitter } from 'events';

describe('AutoArchiveService', () => {
  let instance: DbInstance;
  let services: Services;
  let autoArchive: AutoArchiveService;

  beforeEach(() => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue, new EventEmitter());
    autoArchive = new AutoArchiveService(services);
  });

  afterEach(() => {
    autoArchive.stop();
    instance.close();
  });

  describe('runCleanup', () => {
    it('archives session channels with old messages', async () => {
      // Create tenant and session channel
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/old-session');
      const channel = await services.channels.create(tenant.id, {
        name: 'old-session',
        type: 'session',
        sessionId: 'sess-old',
      });

      // Send a message then manipulate its timestamp to be 4 days ago
      await services.messages.send(tenant.id, {
        channelId: channel.id,
        senderId: 'agent-1',
        senderName: 'Agent',
        senderType: 'agent',
        content: 'old message',
        messageType: 'text',
      });

      // Manipulate message timestamp to 4 days ago using raw SQL
      instance.rawDb.prepare(
        "UPDATE messages SET created_at = datetime('now', '-96 hours') WHERE channel_id = ?"
      ).run(channel.id);

      // Run cleanup
      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(1);

      // Verify channel is archived
      const ch = services.channels.getById(tenant.id, channel.id);
      expect(ch).not.toBeNull();
      expect(ch!.archivedAt).not.toBeNull();
      expect(ch!.userArchived).toBe(false);
    });

    it('archives session channels with no messages created 72h+ ago', async () => {
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/empty-old-session');
      const channel = await services.channels.create(tenant.id, {
        name: 'empty-old-session',
        type: 'session',
        sessionId: 'sess-empty',
      });

      // Manipulate channel created_at to 4 days ago
      instance.rawDb.prepare(
        "UPDATE channels SET created_at = datetime('now', '-96 hours') WHERE id = ?"
      ).run(channel.id);

      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(1);

      const ch = services.channels.getById(tenant.id, channel.id);
      expect(ch!.archivedAt).not.toBeNull();
    });

    it('does NOT archive session channels with recent messages', async () => {
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/recent-session');
      const channel = await services.channels.create(tenant.id, {
        name: 'recent-session',
        type: 'session',
        sessionId: 'sess-recent',
      });

      // Send a message (will have current timestamp)
      await services.messages.send(tenant.id, {
        channelId: channel.id,
        senderId: 'agent-1',
        senderName: 'Agent',
        senderType: 'agent',
        content: 'recent message',
        messageType: 'text',
      });

      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(0);

      const ch = services.channels.getById(tenant.id, channel.id);
      expect(ch!.archivedAt).toBeNull();
    });

    it('does NOT archive manual/team channels regardless of age', async () => {
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/old-team');
      const channel = await services.channels.create(tenant.id, {
        name: 'old-team',
        type: 'manual',
      });

      // Send old message
      await services.messages.send(tenant.id, {
        channelId: channel.id,
        senderId: 'agent-1',
        senderName: 'Agent',
        senderType: 'agent',
        content: 'old team message',
        messageType: 'text',
      });

      // Manipulate to 4 days ago
      instance.rawDb.prepare(
        "UPDATE messages SET created_at = datetime('now', '-96 hours') WHERE channel_id = ?"
      ).run(channel.id);

      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(0);

      const ch = services.channels.getById(tenant.id, channel.id);
      expect(ch!.archivedAt).toBeNull();
    });

    it('does NOT archive user-archived channels', async () => {
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/user-archived');
      const channel = await services.channels.create(tenant.id, {
        name: 'user-archived-session',
        type: 'session',
        sessionId: 'sess-user',
      });

      // User archives the channel
      await services.channels.archive(tenant.id, channel.id, true);

      // Run cleanup — should not touch already-archived channels
      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(0);
    });

    it('archives across multiple tenants', async () => {
      const tenant1 = await services.tenants.upsertByCodebasePath('proj-a', '/test/proj-a');
      const tenant2 = await services.tenants.upsertByCodebasePath('proj-b', '/test/proj-b');

      const ch1 = await services.channels.create(tenant1.id, {
        name: 'session-a',
        type: 'session',
        sessionId: 'sess-a',
      });
      const ch2 = await services.channels.create(tenant2.id, {
        name: 'session-b',
        type: 'session',
        sessionId: 'sess-b',
      });

      // Send old messages to both
      await services.messages.send(tenant1.id, {
        channelId: ch1.id,
        senderId: 'agent-1',
        senderName: 'Agent',
        senderType: 'agent',
        content: 'msg a',
        messageType: 'text',
      });
      await services.messages.send(tenant2.id, {
        channelId: ch2.id,
        senderId: 'agent-1',
        senderName: 'Agent',
        senderType: 'agent',
        content: 'msg b',
        messageType: 'text',
      });

      // Make both old
      instance.rawDb.prepare(
        "UPDATE messages SET created_at = datetime('now', '-96 hours')"
      ).run();

      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(2);
    });

    it('does not archive recently-created empty session channels', async () => {
      const tenant = await services.tenants.upsertByCodebasePath('test', '/test/new-empty');
      await services.channels.create(tenant.id, {
        name: 'new-empty-session',
        type: 'session',
        sessionId: 'sess-new-empty',
      });

      // Channel was just created, so it's within 72h
      const archived = await autoArchive.runCleanup();
      expect(archived).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('can start and stop without errors', () => {
      autoArchive.start();
      expect(() => autoArchive.stop()).not.toThrow();
    });

    it('start is idempotent', () => {
      autoArchive.start();
      autoArchive.start(); // second call should be no-op
      autoArchive.stop();
    });
  });
});
