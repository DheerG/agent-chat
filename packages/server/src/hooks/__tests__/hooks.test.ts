import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../http/app.js';
import { createDb, type DbInstance } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices, type Services } from '../../services/index.js';

describe('Hook Routes', () => {
  let instance: DbInstance;
  let services: Services;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);
    app = createApp(services);
  });

  async function postHook(eventType: string, payload: Record<string, unknown>) {
    return app.request(`/api/hooks/${eventType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  const basePayload = {
    session_id: 'test-session-123',
    cwd: '/Users/test/my-project',
  };

  describe('SessionStart', () => {
    it('creates session channel and returns handled: true', async () => {
      const res = await postHook('SessionStart', basePayload);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
      expect(body.handled).toBe(true);
      expect(body.action).toBe('channel_created');

      // Verify channel was created
      const tenants = services.tenants.listAll();
      expect(tenants.length).toBe(1);
      const channels = services.channels.listByTenant(tenants[0].id);
      expect(channels.length).toBe(1);
      expect(channels[0].name).toBe('session-test-session-123');
      expect(channels[0].type).toBe('session');
      expect(channels[0].sessionId).toBe('test-session-123');
    });

    it('upserts presence to active', async () => {
      await postHook('SessionStart', basePayload);
      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const presenceRecords = services.presence.getByChannel(tenants[0].id, channels[0].id);
      expect(presenceRecords.length).toBe(1);
      expect(presenceRecords[0].status).toBe('active');
      expect(presenceRecords[0].agentId).toBe('test-session-123');
    });

    it('posts a system message about session start', async () => {
      await postHook('SessionStart', basePayload);
      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const messages = services.messages.list(tenants[0].id, channels[0].id);
      expect(messages.messages.length).toBe(1);
      expect(messages.messages[0].senderType).toBe('system');
      expect(messages.messages[0].content).toContain('test-session-123');
    });

    it('restores and reuses an archived session channel instead of creating a new one', async () => {
      // First SessionStart creates a channel
      await postHook('SessionStart', basePayload);

      // Verify channel exists
      const tenantList = services.tenants.listAll();
      const tenant = tenantList[0];
      const channelsBefore = services.channels.listByTenant(tenant.id);
      expect(channelsBefore.length).toBe(1);
      const channelId = channelsBefore[0].id;

      // Archive the session channel (user-initiated)
      await services.channels.archive(tenant.id, channelId, true);

      // Verify it's archived
      const archived = services.channels.getById(tenant.id, channelId);
      expect(archived!.archivedAt).not.toBeNull();
      expect(archived!.userArchived).toBe(true);

      // Second SessionStart with same session_id should restore, not create duplicate
      const res = await postHook('SessionStart', basePayload);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.handled).toBe(true);
      expect(body.action).toBe('channel_restored');

      // Verify only one channel exists (no duplicate)
      const allChannels = services.channels.listByTenant(tenant.id);
      expect(allChannels.length).toBe(1);
      expect(allChannels[0].id).toBe(channelId);

      // Verify it's no longer archived
      const restored = services.channels.getById(tenant.id, channelId);
      expect(restored!.archivedAt).toBeNull();
    });

    it('reuses an existing non-archived session channel', async () => {
      // First SessionStart creates a channel
      await postHook('SessionStart', basePayload);

      const tenantList = services.tenants.listAll();
      const tenant = tenantList[0];
      const channelsBefore = services.channels.listByTenant(tenant.id);
      expect(channelsBefore.length).toBe(1);
      const channelId = channelsBefore[0].id;

      // Second SessionStart with same session_id should reuse
      const res = await postHook('SessionStart', basePayload);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.handled).toBe(true);
      expect(body.action).toBe('channel_reused');

      // Still only one channel
      const allChannels = services.channels.listByTenant(tenant.id);
      expect(allChannels.length).toBe(1);
      expect(allChannels[0].id).toBe(channelId);
    });
  });

  describe('PreToolUse', () => {
    it('stores event message with tool_name in metadata', async () => {
      // First create session channel
      await postHook('SessionStart', basePayload);

      const res = await postHook('PreToolUse', {
        ...basePayload,
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.handled).toBe(true);

      // Verify event message
      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const messages = services.messages.list(tenants[0].id, channels[0].id);
      // Should have: system message from SessionStart + PreToolUse event
      const eventMsg = messages.messages.find(m => m.messageType === 'event');
      expect(eventMsg).toBeDefined();
      expect(eventMsg!.senderType).toBe('hook');
      expect(eventMsg!.metadata.tool_name).toBe('Bash');
      expect(eventMsg!.metadata.phase).toBe('pre');
    });

    it('returns handled: false when no session channel exists', async () => {
      const res = await postHook('PreToolUse', {
        ...basePayload,
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.handled).toBe(false);
      expect(body.action).toBe('no_channel');
    });
  });

  describe('PostToolUse', () => {
    it('stores event message with tool_output_summary', async () => {
      await postHook('SessionStart', basePayload);

      const res = await postHook('PostToolUse', {
        ...basePayload,
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_output: 'file1.ts\nfile2.ts',
      });
      expect(res.status).toBe(200);

      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const messages = services.messages.list(tenants[0].id, channels[0].id);
      const eventMsg = messages.messages.find(m => m.metadata.phase === 'post');
      expect(eventMsg).toBeDefined();
      expect(eventMsg!.metadata.tool_output_summary).toBe('file1.ts\nfile2.ts');
      expect(eventMsg!.metadata.tool_name).toBe('Bash');
    });

    it('updates presence as heartbeat', async () => {
      await postHook('SessionStart', basePayload);
      await postHook('PostToolUse', {
        ...basePayload,
        tool_name: 'Read',
        tool_input: {},
        tool_output: 'content',
      });

      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const presenceRecords = services.presence.getByChannel(tenants[0].id, channels[0].id);
      expect(presenceRecords[0].status).toBe('active');
    });
  });

  describe('Unknown event', () => {
    it('returns 200 { received: true, handled: false }', async () => {
      const res = await postHook('SomeUnknownEvent', basePayload);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
      expect(body.handled).toBe(false);
      expect(body.action).toBe('discarded');
    });
  });

  describe('Validation', () => {
    it('returns 422 when session_id is missing', async () => {
      const res = await postHook('SessionStart', { cwd: '/test' });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 when cwd is missing', async () => {
      const res = await postHook('SessionStart', { session_id: 'test-123' });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/api/hooks/SessionStart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('SessionEnd', () => {
    it('updates presence to idle', async () => {
      await postHook('SessionStart', basePayload);
      await postHook('SessionEnd', basePayload);

      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const presenceRecords = services.presence.getByChannel(tenants[0].id, channels[0].id);
      expect(presenceRecords[0].status).toBe('idle');
    });

    it('posts a system message about session end', async () => {
      await postHook('SessionStart', basePayload);
      await postHook('SessionEnd', basePayload);

      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const messages = services.messages.list(tenants[0].id, channels[0].id);
      // Should have: session start system msg + session end system msg
      const systemMsgs = messages.messages.filter(m => m.senderType === 'system');
      expect(systemMsgs.length).toBe(2);
      const contents = systemMsgs.map(m => m.content);
      expect(contents).toContain(`Session ended: ${basePayload.session_id}`);
    });
  });

  describe('End-to-end flow', () => {
    it('SessionStart -> PreToolUse -> PostToolUse creates channel and stores events', async () => {
      await postHook('SessionStart', basePayload);
      await postHook('PreToolUse', { ...basePayload, tool_name: 'Read', tool_input: { file_path: 'test.ts' } });
      await postHook('PostToolUse', { ...basePayload, tool_name: 'Read', tool_input: { file_path: 'test.ts' }, tool_output: 'contents...' });

      const tenants = services.tenants.listAll();
      const channels = services.channels.listByTenant(tenants[0].id);
      const messages = services.messages.list(tenants[0].id, channels[0].id);

      // System message + PreToolUse + PostToolUse = 3 messages
      expect(messages.messages.length).toBe(3);
      const eventMessages = messages.messages.filter(m => m.messageType === 'event');
      expect(eventMessages.length).toBe(2);
    });
  });
});
