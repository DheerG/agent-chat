import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel } from '@agent-chat/shared';

let app: Hono;

beforeEach(() => {
  const instance = createDb(':memory:');
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

    const res = await app.request(`/api/tenants/${tenant.id}/channels`);
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
