import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel, Presence } from '@agent-chat/shared';
import type { Services } from '../../services/index.js';

let app: Hono;
let services: Services;

beforeEach(() => {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  services = createServices(instance, queue);
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

describe('Presence routes', () => {
  test('GET returns empty presence array for channel with no agents', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/presence-empty');
    const res = await app.request(
      `/api/tenants/${tenant.id}/channels/${channel.id}/presence`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { presence: Presence[] };
    expect(body.presence).toEqual([]);
  });

  test('GET returns presence data for agents in channel', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/presence-agents');
    // Seed presence data via service
    await services.presence.upsert(tenant.id, {
      agentId: 'agent-1',
      channelId: channel.id,
      status: 'active',
    });
    await services.presence.upsert(tenant.id, {
      agentId: 'agent-2',
      channelId: channel.id,
      status: 'idle',
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/channels/${channel.id}/presence`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { presence: Presence[] };
    expect(body.presence).toHaveLength(2);
    const statuses = body.presence.map((p) => ({ agentId: p.agentId, status: p.status }));
    expect(statuses).toContainEqual({ agentId: 'agent-1', status: 'active' });
    expect(statuses).toContainEqual({ agentId: 'agent-2', status: 'idle' });
  });

  test('GET returns 404 for unknown tenant', async () => {
    const res = await app.request(
      `/api/tenants/nonexistent/channels/fake-channel/presence`
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string; code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  test('GET returns 404 for unknown channel', async () => {
    const { tenant } = await seedTenantAndChannel('/presence-no-channel');
    const res = await app.request(
      `/api/tenants/${tenant.id}/channels/nonexistent/presence`
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string; code: string };
    expect(body.code).toBe('NOT_FOUND');
  });
});
