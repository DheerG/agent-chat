import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel, Message } from '@agent-chat/shared';

let app: Hono;

beforeEach(() => {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  app = createApp(services);
});

async function seedTenantAndChannel(path?: string): Promise<{ tenant: Tenant; channel: Channel }> {
  const codebasePath = path ?? `/t-${Date.now()}-${Math.random()}`;
  const tRes = await app.request('/api/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', codebasePath }),
  });
  const { tenant } = await tRes.json() as { tenant: Tenant };
  const cRes = await app.request(`/api/tenants/${tenant.id}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'general' }),
  });
  const { channel } = await cRes.json() as { channel: Channel };
  return { tenant, channel };
}

async function sendMessage(tenantId: string, channelId: string, content: string, senderName = 'Agent One'): Promise<Message> {
  const res = await app.request(`/api/tenants/${tenantId}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderId: 'agent-1',
      senderName,
      senderType: 'agent',
      content,
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { message: Message };
  return body.message;
}

describe('Message routes', () => {
  test('POST inserts message and returns 201 with all sender identity fields (MSG-06)', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-identity-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'agent-123',
        senderName: 'Test Agent',
        senderType: 'agent',
        content: 'Hello world',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { message: Message };
    expect(body.message.senderId).toBe('agent-123');
    expect(body.message.senderName).toBe('Test Agent');
    expect(body.message.senderType).toBe('agent');
    expect(body.message.content).toBe('Hello world');
    expect(typeof body.message.id).toBe('string');
    expect(body.message.tenantId).toBe(tenant.id);
    expect(body.message.channelId).toBe(channel.id);
  });

  test('GET returns message list with sender identity in each item (MSG-06)', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-list-identity-test');
    await sendMessage(tenant.id, channel.id, 'msg1');
    await sendMessage(tenant.id, channel.id, 'msg2');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as { messages: Message[]; pagination: { hasMore: boolean } };
    expect(body.messages.length).toBe(2);
    for (const m of body.messages) {
      expect(m.senderName).toBe('Agent One');
      expect(m.senderType).toBe('agent');
      expect(m.senderId).toBe('agent-1');
    }
  });

  test('POST routes message to correct tenant+channel and GET retrieves it (MSG-01)', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-routing-test');
    const sent = await sendMessage(tenant.id, channel.id, 'routed message');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as { messages: Message[] };
    const found = body.messages.find((m) => m.id === sent.id);
    expect(found).toBeDefined();
    expect(found?.content).toBe('routed message');
  });

  test('GET with limit=2 on 3 messages: first page hasMore=true, second page hasMore=false (MSG-04)', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-pagination-test');

    await sendMessage(tenant.id, channel.id, 'first');
    await new Promise((r) => setTimeout(r, 2)); // ensure unique ULID timestamps
    await sendMessage(tenant.id, channel.id, 'second');
    await new Promise((r) => setTimeout(r, 2));
    await sendMessage(tenant.id, channel.id, 'third');

    // First page: limit=2, no cursor
    const page1Res = await app.request(
      `/api/tenants/${tenant.id}/channels/${channel.id}/messages?limit=2`
    );
    expect(page1Res.status).toBe(200);
    const page1 = await page1Res.json() as {
      messages: Message[];
      pagination: { hasMore: boolean; nextCursor?: string; prevCursor?: string };
    };
    expect(page1.messages.length).toBe(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.messages[0].content).toBe('first');
    expect(page1.messages[1].content).toBe('second');
    expect(page1.pagination.nextCursor).toBeDefined();

    // Second page: after the last item of page 1
    const cursor = page1.pagination.nextCursor!;
    const page2Res = await app.request(
      `/api/tenants/${tenant.id}/channels/${channel.id}/messages?limit=2&after=${cursor}`
    );
    expect(page2Res.status).toBe(200);
    const page2 = await page2Res.json() as {
      messages: Message[];
      pagination: { hasMore: boolean };
    };
    expect(page2.messages.length).toBe(1);
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.messages[0].content).toBe('third');
  });

  test('GET returns messages in ascending chronological order (oldest first)', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-order-test');
    await sendMessage(tenant.id, channel.id, 'alpha');
    await new Promise((r) => setTimeout(r, 2));
    await sendMessage(tenant.id, channel.id, 'beta');
    await new Promise((r) => setTimeout(r, 2));
    await sendMessage(tenant.id, channel.id, 'gamma');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`);
    const body = await res.json() as { messages: Message[] };
    expect(body.messages[0].content).toBe('alpha');
    expect(body.messages[1].content).toBe('beta');
    expect(body.messages[2].content).toBe('gamma');
  });

  test('POST with missing required fields returns 422 VALIDATION_ERROR', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-validation-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'no sender info' }), // missing senderId, senderName, senderType
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { code: string; details: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  test('GET messages returns 404 for unknown tenant', async () => {
    const res = await app.request('/api/tenants/bad-tenant-id/channels/bad-channel-id/messages');
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  test('GET messages returns 404 for unknown channel', async () => {
    const { tenant } = await seedTenantAndChannel('/msg-ch-404-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/bad-channel-id/messages`);
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  test('POST messages returns 404 for unknown tenant', async () => {
    const res = await app.request('/api/tenants/bad-tenant/channels/bad-channel/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 's',
        senderName: 'S',
        senderType: 'agent',
        content: 'test',
      }),
    });
    expect(res.status).toBe(404);
  });

  test('GET returns empty messages array with hasMore=false for new channel', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/msg-empty-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as { messages: Message[]; pagination: { hasMore: boolean } };
    expect(body.messages.length).toBe(0);
    expect(body.pagination.hasMore).toBe(false);
  });
});
