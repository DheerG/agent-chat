import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel, RecentChannel } from '@agent-chat/shared';

let app: Hono;

beforeEach(() => {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  app = createApp(services);
});

async function createTenant(name: string, codebasePath: string): Promise<Tenant> {
  const res = await app.request('/api/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, codebasePath }),
  });
  return (await res.json() as { tenant: Tenant }).tenant;
}

async function createChannel(tenantId: string, name: string): Promise<Channel> {
  const res = await app.request(`/api/tenants/${tenantId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await res.json() as { channel: Channel }).channel;
}

async function sendMessage(tenantId: string, channelId: string, content: string): Promise<void> {
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

describe('GET /api/channels/recent', () => {
  test('returns channels from multiple tenants', async () => {
    const t1 = await createTenant('Project A', '/project-a');
    const t2 = await createTenant('Project B', '/project-b');
    await createChannel(t1.id, 'ch-a1');
    await createChannel(t2.id, 'ch-b1');

    const res = await app.request('/api/channels/recent');
    expect(res.status).toBe(200);
    const body = await res.json() as { channels: RecentChannel[] };
    expect(body.channels.length).toBe(2);

    // Both tenants represented
    const tenantNames = body.channels.map(c => c.tenantName);
    expect(tenantNames).toContain('Project A');
    expect(tenantNames).toContain('Project B');
  });

  test('sorts channels by last activity (most recent first)', async () => {
    const t1 = await createTenant('T1', '/t1');
    const ch1 = await createChannel(t1.id, 'older-channel');
    const ch2 = await createChannel(t1.id, 'newer-channel');

    // Send message to ch1 first, then ch2
    await sendMessage(t1.id, ch1.id, 'older message');
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 10));
    await sendMessage(t1.id, ch2.id, 'newer message');

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    // Newer channel should be first
    expect(body.channels[0]!.name).toBe('newer-channel');
    expect(body.channels[1]!.name).toBe('older-channel');
  });

  test('channels with no messages use created_at as fallback', async () => {
    const t1 = await createTenant('T1', '/t1');
    await createChannel(t1.id, 'empty-channel');

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels.length).toBe(1);
    expect(body.channels[0]!.name).toBe('empty-channel');
    expect(body.channels[0]!.lastActivity).toBeNull();
  });

  test('includes archived channels', async () => {
    const t1 = await createTenant('T1', '/t1');
    const ch = await createChannel(t1.id, 'to-archive');

    // Archive the channel
    await app.request(`/api/tenants/${t1.id}/channels/${ch.id}/archive`, { method: 'PATCH' });

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels.length).toBe(1);
    expect(body.channels[0]!.name).toBe('to-archive');
    expect(body.channels[0]!.archivedAt).not.toBeNull();
  });

  test('respects limit parameter', async () => {
    const t1 = await createTenant('T1', '/t1');
    await createChannel(t1.id, 'ch1');
    await createChannel(t1.id, 'ch2');
    await createChannel(t1.id, 'ch3');

    const res = await app.request('/api/channels/recent?limit=2');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels.length).toBe(2);
  });

  test('includes tenantName field', async () => {
    const t1 = await createTenant('My Codebase', '/my-codebase');
    await createChannel(t1.id, 'general');

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels[0]!.tenantName).toBe('My Codebase');
  });

  test('includes lastActivity field with message timestamp', async () => {
    const t1 = await createTenant('T1', '/t1');
    const ch = await createChannel(t1.id, 'active');
    await sendMessage(t1.id, ch.id, 'hello');

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels[0]!.lastActivity).not.toBeNull();
    // lastActivity should be a valid ISO date
    expect(new Date(body.channels[0]!.lastActivity!).toISOString()).toBe(body.channels[0]!.lastActivity);
  });

  test('defaults to limit 100', async () => {
    const t1 = await createTenant('T1', '/t1');
    // Create a few channels and verify they all return (well under 100)
    for (let i = 0; i < 5; i++) {
      await createChannel(t1.id, `ch-${i}`);
    }

    const res = await app.request('/api/channels/recent');
    const body = await res.json() as { channels: RecentChannel[] };

    expect(body.channels.length).toBe(5);
  });
});
