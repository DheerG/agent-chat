import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant } from '@agent-chat/shared';

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

describe('Tenant routes', () => {
  test('POST /api/tenants creates a tenant and returns 201', async () => {
    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Project', codebasePath: '/home/user/project' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { tenant: { id: string; name: string; codebasePath: string } };
    expect(body.tenant.name).toBe('My Project');
    expect(body.tenant.codebasePath).toBe('/home/user/project');
    expect(typeof body.tenant.id).toBe('string');
    expect(body.tenant.id.length).toBeGreaterThan(0);
  });

  test('POST /api/tenants with same codebasePath returns existing tenant (upsert idempotency)', async () => {
    const payload = { name: 'Project', codebasePath: '/same/path' };
    const res1 = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const t1 = (await res1.json() as { tenant: { id: string } }).tenant;

    const res2 = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Different Name', codebasePath: '/same/path' }),
    });
    const t2 = (await res2.json() as { tenant: { id: string } }).tenant;

    // Same codebasePath → same tenant returned
    expect(t1.id).toBe(t2.id);
  });

  test('POST /api/tenants with missing codebasePath returns 422 VALIDATION_ERROR', async () => {
    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Path' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { code: string; details: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  test('POST /api/tenants with missing name returns 422 VALIDATION_ERROR', async () => {
    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codebasePath: '/path/only' }),
    });
    expect(res.status).toBe(422);
  });

  test('GET /api/tenants lists all tenants', async () => {
    await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'P1', codebasePath: '/p1' }),
    });
    await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'P2', codebasePath: '/p2' }),
    });

    const res = await app.request('/api/tenants');
    expect(res.status).toBe(200);
    const body = await res.json() as { tenants: unknown[] };
    expect(Array.isArray(body.tenants)).toBe(true);
    expect(body.tenants.length).toBe(2);
  });

  test('GET /api/tenants/:tenantId returns 404 for unknown id', async () => {
    const res = await app.request('/api/tenants/nonexistent-id-123');
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  test('GET /api/tenants/:tenantId returns existing tenant', async () => {
    const createRes = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'T', codebasePath: '/t-get-test' }),
    });
    const { tenant } = await createRes.json() as { tenant: { id: string; name: string } };

    const getRes = await app.request(`/api/tenants/${tenant.id}`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as { tenant: { id: string; name: string } };
    expect(body.tenant.id).toBe(tenant.id);
    expect(body.tenant.name).toBe('T');
  });
});

describe('Tenant archive/restore routes', () => {
  test('PATCH /api/tenants/:tenantId/archive returns 200 and tenant disappears from GET /api/tenants', async () => {
    const tenant = await createTenant('/archive-test');

    const archiveRes = await app.request(`/api/tenants/${tenant.id}/archive`, { method: 'PATCH' });
    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json() as { success: boolean };
    expect(archiveBody.success).toBe(true);

    // Tenant should no longer appear in active list
    const listRes = await app.request('/api/tenants');
    const listBody = await listRes.json() as { tenants: Tenant[] };
    expect(listBody.tenants.find(t => t.id === tenant.id)).toBeUndefined();
  });

  test('PATCH /api/tenants/:tenantId/archive on non-existent tenant returns 404', async () => {
    const res = await app.request('/api/tenants/nonexistent-id/archive', { method: 'PATCH' });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/tenants/:tenantId/restore returns 200 and tenant reappears in GET /api/tenants', async () => {
    const tenant = await createTenant('/restore-test');

    await app.request(`/api/tenants/${tenant.id}/archive`, { method: 'PATCH' });
    const restoreRes = await app.request(`/api/tenants/${tenant.id}/restore`, { method: 'PATCH' });
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json() as { success: boolean };
    expect(restoreBody.success).toBe(true);

    // Tenant should reappear in active list
    const listRes = await app.request('/api/tenants');
    const listBody = await listRes.json() as { tenants: Tenant[] };
    expect(listBody.tenants.find(t => t.id === tenant.id)).toBeDefined();
  });

  test('GET /api/tenants/archived returns only archived tenants', async () => {
    const t1 = await createTenant('/archived-list-1');
    const t2 = await createTenant('/archived-list-2');

    await app.request(`/api/tenants/${t1.id}/archive`, { method: 'PATCH' });

    const archivedRes = await app.request('/api/tenants/archived');
    expect(archivedRes.status).toBe(200);
    const archivedBody = await archivedRes.json() as { tenants: Tenant[] };
    expect(archivedBody.tenants.length).toBe(1);
    expect(archivedBody.tenants[0].id).toBe(t1.id);

    // t2 should still be in active list
    const activeRes = await app.request('/api/tenants');
    const activeBody = await activeRes.json() as { tenants: Tenant[] };
    expect(activeBody.tenants.find(t => t.id === t2.id)).toBeDefined();
    expect(activeBody.tenants.find(t => t.id === t1.id)).toBeUndefined();
  });

  test('PATCH /api/tenants/:tenantId/archive cascades to channels', async () => {
    const tenant = await createTenant('/cascade-test');

    // Create channels
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

    // Archive tenant
    await app.request(`/api/tenants/${tenant.id}/archive`, { method: 'PATCH' });

    // Active channels should be empty
    const channelsRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const channelsBody = await channelsRes.json() as { channels: unknown[] };
    expect(channelsBody.channels.length).toBe(0);

    // Archived channels should have both
    const archivedChRes = await app.request(`/api/tenants/${tenant.id}/channels/archived`);
    const archivedChBody = await archivedChRes.json() as { channels: unknown[] };
    expect(archivedChBody.channels.length).toBe(2);
  });

  test('Archive then restore tenant restores all channels', async () => {
    const tenant = await createTenant('/cascade-restore-test');

    await app.request(`/api/tenants/${tenant.id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ch1' }),
    });

    // Archive then restore
    await app.request(`/api/tenants/${tenant.id}/archive`, { method: 'PATCH' });
    await app.request(`/api/tenants/${tenant.id}/restore`, { method: 'PATCH' });

    // Channels should be back
    const channelsRes = await app.request(`/api/tenants/${tenant.id}/channels`);
    const channelsBody = await channelsRes.json() as { channels: unknown[] };
    expect(channelsBody.channels.length).toBe(1);
  });

  test('GET /api/tenants excludes archived items (regression)', async () => {
    const t1 = await createTenant('/regression-1');
    const t2 = await createTenant('/regression-2');
    const t3 = await createTenant('/regression-3');

    // Archive one tenant
    await app.request(`/api/tenants/${t2.id}/archive`, { method: 'PATCH' });

    const res = await app.request('/api/tenants');
    const body = await res.json() as { tenants: Tenant[] };
    expect(body.tenants.length).toBe(2);
    const ids = body.tenants.map(t => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t3.id);
    expect(ids).not.toContain(t2.id);
  });
});
