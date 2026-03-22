import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel } from '@agent-chat/shared';

let app: Hono;
let testRawDb: ReturnType<typeof createDb>['rawDb'];

beforeEach(() => {
  const instance = createDb(':memory:');
  testRawDb = instance.rawDb;
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  app = createApp(services);
});

async function createTenant(codebasePath = '/test'): Promise<Tenant> {
  const res = await app.request('/api/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', codebasePath }),
  });
  return (await res.json() as { tenant: Tenant }).tenant;
}

async function createChannel(tenantId: string, name = 'general'): Promise<Channel> {
  const res = await app.request(`/api/tenants/${tenantId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await res.json() as { channel: Channel }).channel;
}

describe('Channel routes', () => {
  test('POST /api/tenants/:id/channels creates channel and returns 201', async () => {
    const tenant = await createTenant();

    const res = await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'general' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { channel: Channel };
    expect(body.channel.name).toBe('general');
    expect(body.channel.tenantId).toBe(tenant.id);
    expect(typeof body.channel.id).toBe('string');
  });

  test('POST /api/tenants/:id/channels returns 404 for unknown tenant', async () => {
    const res = await app.request('/api/tenants/bad-tenant-id/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  test('POST /api/tenants/:id/channels returns 422 for missing name', async () => {
    const tenant = await createTenant('/validation-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { code: string; details: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/tenants/:id/channels lists channels for tenant', async () => {
    const tenant = await createTenant('/list-test');
    await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ch1' }),
    });
    await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ch2' }),
    });

    // Use include_stale=true since channels without messages are stale by default
    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    expect(res.status).toBe(200);
    const body = await res.json() as { channels: Channel[] };
    expect(Array.isArray(body.channels)).toBe(true);
    expect(body.channels.length).toBe(2);
  });

  test('GET /api/tenants/:id/channels returns 404 for unknown tenant', async () => {
    const res = await app.request('/api/tenants/bad-tenant/channels');
    expect(res.status).toBe(404);
  });

  test('GET /api/tenants/:id/channels/:channelId returns channel', async () => {
    const tenant = await createTenant('/get-channel-test');
    const createRes = await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-channel' }),
    });
    const { channel } = await createRes.json() as { channel: Channel };

    const getRes = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as { channel: Channel };
    expect(body.channel.id).toBe(channel.id);
    expect(body.channel.name).toBe('my-channel');
  });

  test('GET /api/tenants/:id/channels/:channelId returns 404 for unknown channel', async () => {
    const tenant = await createTenant('/ch-404-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/bad-channel-id`);
    expect(res.status).toBe(404);
  });
});

describe('Channel archive/restore routes', () => {
  test('PATCH /:channelId/archive returns 200 and channel not in GET channels', async () => {
    const tenant = await createTenant('/ch-archive-test');
    const channel = await createChannel(tenant.id, 'ch-to-archive');

    const archiveRes = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });
    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json() as { success: boolean };
    expect(archiveBody.success).toBe(true);

    // Channel should not appear in active list
    const listRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const listBody = await listRes.json() as { channels: Channel[] };
    expect(listBody.channels.find(c => c.id === channel.id)).toBeUndefined();
  });

  test('PATCH /:channelId/archive returns 404 for non-existent channel', async () => {
    const tenant = await createTenant('/ch-archive-404');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/nonexistent/archive`, { method: 'PATCH' });
    expect(res.status).toBe(404);
  });

  test('PATCH /:channelId/restore returns 200 and channel reappears', async () => {
    const tenant = await createTenant('/ch-restore-test');
    const channel = await createChannel(tenant.id, 'ch-to-restore');

    await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });
    const restoreRes = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/restore`, { method: 'PATCH' });
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json() as { success: boolean };
    expect(restoreBody.success).toBe(true);

    // Channel should reappear in channel list (include_stale since no messages)
    const listRes = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const listBody = await listRes.json() as { channels: Channel[] };
    expect(listBody.channels.find(c => c.id === channel.id)).toBeDefined();
  });

  test('GET /channels/archived returns only archived channels', async () => {
    const tenant = await createTenant('/ch-archived-list');
    const ch1 = await createChannel(tenant.id, 'active-ch');
    const ch2 = await createChannel(tenant.id, 'archived-ch');

    await app.request(`/api/tenants/${tenant.id}/channels/${ch2.id}/archive`, { method: 'PATCH' });

    const archivedRes = await app.request(`/api/tenants/${tenant.id}/channels/archived`);
    expect(archivedRes.status).toBe(200);
    const archivedBody = await archivedRes.json() as { channels: Channel[] };
    expect(archivedBody.channels.length).toBe(1);
    expect(archivedBody.channels[0].id).toBe(ch2.id);

    // Non-archived list should only have ch1 (include_stale since no messages)
    const activeRes = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const activeBody = await activeRes.json() as { channels: Channel[] };
    expect(activeBody.channels.length).toBe(1);
    expect(activeBody.channels[0].id).toBe(ch1.id);
  });

  test('Existing channel list endpoints exclude archived items (regression)', async () => {
    const tenant = await createTenant('/ch-regression');
    const ch1 = await createChannel(tenant.id, 'ch-a');
    const ch2 = await createChannel(tenant.id, 'ch-b');
    const ch3 = await createChannel(tenant.id, 'ch-c');

    await app.request(`/api/tenants/${tenant.id}/channels/${ch2.id}/archive`, { method: 'PATCH' });

    // Use include_stale since channels have no messages
    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Channel[] };
    expect(body.channels.length).toBe(2);
    const ids = body.channels.map(c => c.id);
    expect(ids).toContain(ch1.id);
    expect(ids).toContain(ch3.id);
    expect(ids).not.toContain(ch2.id);
  });

  test('PATCH archive on already-archived channel returns 404', async () => {
    const tenant = await createTenant('/ch-double-archive');
    const channel = await createChannel(tenant.id, 'already-archived');

    await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });
    expect(res.status).toBe(404);
  });

  test('PATCH restore on non-archived channel returns 404', async () => {
    const tenant = await createTenant('/ch-not-archived');
    const channel = await createChannel(tenant.id, 'not-archived');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/restore`, { method: 'PATCH' });
    expect(res.status).toBe(404);
  });
});

describe('Stale channel filtering', () => {
  async function sendMessage(tenantId: string, channelId: string, content: string) {
    const res = await app.request(`/api/tenants/${tenantId}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'test-agent',
        senderName: 'Test',
        senderType: 'agent',
        content,
        messageType: 'text',
      }),
    });
    return res;
  }

  test('GET channels without include_stale hides empty channels', async () => {
    const tenant = await createTenant('/stale-empty');
    await createChannel(tenant.id, 'empty-channel');
    const activeChannel = await createChannel(tenant.id, 'active-channel');

    // Send a recent message to active-channel
    await sendMessage(tenant.id, activeChannel.id, 'recent message');

    // Default endpoint should only show the active channel
    const res = await app.request(`/api/tenants/${tenant.id}/channels`);
    const body = await res.json() as { channels: Channel[] };
    expect(body.channels.length).toBe(1);
    expect(body.channels[0].name).toBe('active-channel');
  });

  test('GET channels with include_stale=true returns all with stale flag', async () => {
    const tenant = await createTenant('/stale-flag');
    await createChannel(tenant.id, 'empty-channel');
    const activeChannel = await createChannel(tenant.id, 'active-channel');

    // Send a recent message to active-channel
    await sendMessage(tenant.id, activeChannel.id, 'hello');

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };
    expect(body.channels.length).toBe(2);

    const empty = body.channels.find(c => c.name === 'empty-channel')!;
    const active = body.channels.find(c => c.name === 'active-channel')!;
    expect(empty.stale).toBe(true);
    expect(active.stale).toBe(false);
  });

  test('user_archived flag is set when archiving via API', async () => {
    const tenant = await createTenant('/user-archive-flag');
    const channel = await createChannel(tenant.id, 'flagged');

    await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });

    const archivedRes = await app.request(`/api/tenants/${tenant.id}/channels/archived`);
    const archivedBody = await archivedRes.json() as { channels: Array<Channel & { userArchived: boolean }> };
    expect(archivedBody.channels.length).toBe(1);
    expect(archivedBody.channels[0].userArchived).toBe(true);
  });

  test('restored channel has userArchived cleared', async () => {
    const tenant = await createTenant('/restore-clear-flag');
    const channel = await createChannel(tenant.id, 'restore-me');

    await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/archive`, { method: 'PATCH' });
    await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/restore`, { method: 'PATCH' });

    // After restore, send a message to make it non-stale, then check
    await sendMessage(tenant.id, channel.id, 'post-restore');

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { userArchived: boolean }> };
    const restored = body.channels.find(c => c.id === channel.id)!;
    expect(restored.userArchived).toBe(false);
  });
});

describe('Differentiated stale thresholds by channel type', () => {
  async function createTypedChannel(tenantId: string, name: string, type: 'session' | 'manual', sessionId?: string): Promise<Channel> {
    const res = await app.request(`/api/tenants/${tenantId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, ...(sessionId ? { sessionId } : {}) }),
    });
    return ((await res.json()) as { channel: Channel }).channel;
  }

  async function sendMessage(tenantId: string, channelId: string, content: string) {
    await app.request(`/api/tenants/${tenantId}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'test-agent',
        senderName: 'Test',
        senderType: 'agent',
        content,
        messageType: 'text',
      }),
    });
  }

  function backdateMessages(channelId: string, hoursAgo: number) {
    // Use SQLite datetime() to set timestamp in SQLite-compatible format
    // This ensures consistent comparison with datetime('now', '-Xh') in queries
    testRawDb.prepare(
      `UPDATE messages SET created_at = datetime('now', '-${hoursAgo} hours') WHERE channel_id = ?`
    ).run(channelId);
  }

  test('session channel with 4h-old message is NOT stale (within 8h threshold)', async () => {
    const tenant = await createTenant('/session-4h');
    const ch = await createTypedChannel(tenant.id, 'sess-4h', 'session', 'sess-4h');
    await sendMessage(tenant.id, ch.id, 'recent');
    backdateMessages(ch.id, 4);

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };
    const found = body.channels.find(c => c.id === ch.id)!;
    expect(found.stale).toBe(false);

    // Should also appear in default (non-stale) listing
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.some(c => c.id === ch.id)).toBe(true);
  });

  test('session channel with 10h-old message IS stale (beyond 8h threshold)', async () => {
    const tenant = await createTenant('/session-10h');
    const ch = await createTypedChannel(tenant.id, 'sess-10h', 'session', 'sess-10h');
    await sendMessage(tenant.id, ch.id, 'old message');
    backdateMessages(ch.id, 10);

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };
    const found = body.channels.find(c => c.id === ch.id)!;
    expect(found.stale).toBe(true);

    // Should NOT appear in default listing
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.some(c => c.id === ch.id)).toBe(false);
  });

  test('manual channel with 10h-old message is NOT stale (within 48h threshold)', async () => {
    const tenant = await createTenant('/manual-10h');
    const ch = await createTypedChannel(tenant.id, 'team-10h', 'manual');
    await sendMessage(tenant.id, ch.id, 'team message');
    backdateMessages(ch.id, 10);

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };
    const found = body.channels.find(c => c.id === ch.id)!;
    expect(found.stale).toBe(false);

    // Should appear in default listing
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.some(c => c.id === ch.id)).toBe(true);
  });

  test('manual channel with 50h-old message IS stale (beyond 48h threshold)', async () => {
    const tenant = await createTenant('/manual-50h');
    const ch = await createTypedChannel(tenant.id, 'team-50h', 'manual');
    await sendMessage(tenant.id, ch.id, 'old team message');
    backdateMessages(ch.id, 50);

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };
    const found = body.channels.find(c => c.id === ch.id)!;
    expect(found.stale).toBe(true);

    // Should NOT appear in default listing
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.some(c => c.id === ch.id)).toBe(false);
  });

  test('same 10h age: session is stale, manual is not stale', async () => {
    const tenant = await createTenant('/diff-threshold');
    const sessionCh = await createTypedChannel(tenant.id, 'sess-diff', 'session', 'sess-diff');
    const manualCh = await createTypedChannel(tenant.id, 'team-diff', 'manual');

    await sendMessage(tenant.id, sessionCh.id, 'session msg');
    await sendMessage(tenant.id, manualCh.id, 'team msg');
    backdateMessages(sessionCh.id, 10);
    backdateMessages(manualCh.id, 10);

    const res = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const body = await res.json() as { channels: Array<Channel & { stale: boolean }> };

    const session = body.channels.find(c => c.name === 'sess-diff')!;
    const manual = body.channels.find(c => c.name === 'team-diff')!;

    expect(session.type).toBe('session');
    expect(manual.type).toBe('manual');
    // 10h old: session (8h threshold) = stale, manual (48h threshold) = not stale
    expect(session.stale).toBe(true);
    expect(manual.stale).toBe(false);

    // Default listing should only show the manual channel
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.length).toBe(1);
    expect(defaultBody.channels[0].name).toBe('team-diff');
  });

  test('empty channels are stale regardless of type', async () => {
    const tenant = await createTenant('/empty-types');
    await createTypedChannel(tenant.id, 'empty-session', 'session', 'empty-s');
    await createTypedChannel(tenant.id, 'empty-manual', 'manual');

    // Default endpoint should return no channels (both empty = stale)
    const defaultRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const defaultBody = await defaultRes.json() as { channels: Channel[] };
    expect(defaultBody.channels.length).toBe(0);

    // include_stale should return both, marked stale
    const allRes = await app.request(`/api/tenants/${tenant.id}/channels?include_stale=true`);
    const allBody = await allRes.json() as { channels: Array<Channel & { stale: boolean }> };
    expect(allBody.channels.length).toBe(2);
    expect(allBody.channels.every(c => c.stale)).toBe(true);
  });
});
