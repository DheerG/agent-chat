import { describe, test, expect, beforeEach } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import type { Tenant, Channel, Document } from '@agent-chat/shared';

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

async function createDocument(
  tenantId: string,
  channelId: string,
  title: string,
  content = 'test content',
): Promise<Document> {
  const res = await app.request(`/api/tenants/${tenantId}/channels/${channelId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content,
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { document: Document };
  return body.document;
}

describe('Document routes', () => {
  test('POST creates document and returns 201 with correct fields', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-post-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Doc',
        content: 'Hello world',
        createdById: 'agent-1',
        createdByName: 'Agent One',
        createdByType: 'agent',
      }),
    });

    expect(res.status).toBe(201);
    const { document } = await res.json() as { document: Document };
    expect(document.id).toBeDefined();
    expect(document.title).toBe('Test Doc');
    expect(document.content).toBe('Hello world');
    expect(document.contentType).toBe('text');
    expect(document.createdById).toBe('agent-1');
    expect(document.createdByName).toBe('Agent One');
  });

  test('GET list returns all documents for a channel', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-list-test');
    await createDocument(tenant.id, channel.id, 'Doc 1');
    await createDocument(tenant.id, channel.id, 'Doc 2');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents`);
    expect(res.status).toBe(200);
    const { documents } = await res.json() as { documents: Document[] };
    expect(documents).toHaveLength(2);
  });

  test('GET by ID returns single document with content', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-get-test');
    const doc = await createDocument(tenant.id, channel.id, 'Get Test', 'Detailed content');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents/${doc.id}`);
    expect(res.status).toBe(200);
    const { document } = await res.json() as { document: Document };
    expect(document.title).toBe('Get Test');
    expect(document.content).toBe('Detailed content');
  });

  test('GET by ID returns 404 for nonexistent document', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-404-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents/nonexistent`);
    expect(res.status).toBe(404);
  });

  test('PUT updates document title and content', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-put-test');
    const doc = await createDocument(tenant.id, channel.id, 'Original', 'Original content');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated', content: 'New content' }),
    });

    expect(res.status).toBe(200);
    const { document } = await res.json() as { document: Document };
    expect(document.title).toBe('Updated');
    expect(document.content).toBe('New content');
  });

  test('PUT returns 404 for nonexistent document', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-put-404-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents/nonexistent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });
    expect(res.status).toBe(404);
  });

  test('PUT with neither title nor content returns 422', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-put-invalid-test');
    const doc = await createDocument(tenant.id, channel.id, 'Test');

    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  test('POST with missing required fields returns 422', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-post-invalid-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'no title' }),
    });
    expect(res.status).toBe(422);
  });

  test('POST returns 404 for nonexistent tenant', async () => {
    const res = await app.request('/api/tenants/nonexistent/channels/any/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test',
        createdById: 'a',
        createdByName: 'A',
      }),
    });
    expect(res.status).toBe(404);
  });

  test('GET list returns 404 for nonexistent tenant', async () => {
    const res = await app.request('/api/tenants/nonexistent/channels/any/documents');
    expect(res.status).toBe(404);
  });

  test('POST with content_type markdown creates markdown document', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/doc-md-test');
    const res = await app.request(`/api/tenants/${tenant.id}/channels/${channel.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'MD Doc',
        content: '# Hello',
        contentType: 'markdown',
        createdById: 'agent-1',
        createdByName: 'Agent One',
      }),
    });

    expect(res.status).toBe(201);
    const { document } = await res.json() as { document: Document };
    expect(document.contentType).toBe('markdown');
  });
});
