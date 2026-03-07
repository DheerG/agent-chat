import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';

let app: Hono;

beforeEach(() => {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  app = createApp(services);
});

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
