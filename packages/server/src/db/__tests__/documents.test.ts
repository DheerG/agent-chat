import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDb } from '../index.js';
import { WriteQueue } from '../queue.js';
import { createServices } from '../../services/index.js';
import type { DbInstance } from '../index.js';
import type { Services } from '../../services/index.js';

describe('Documents — data layer', () => {
  let instance: DbInstance;
  let services: Services;
  let tenantId: string;
  let channelId: string;

  beforeEach(async () => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);
    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/docs');
    tenantId = tenant.id;
    const channel = await services.channels.create(tenantId, { name: 'doc-channel' });
    channelId = channel.id;
  });

  afterEach(() => {
    instance.close();
  });

  test('documents table exists in schema', () => {
    const tables = instance.rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map(t => t.name)).toContain('documents');
  });

  test('composite index exists on documents(tenant_id, channel_id)', () => {
    const indexes = instance.rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='documents'")
      .all() as Array<{ name: string }>;
    expect(indexes.map(i => i.name)).toContain('idx_documents_tenant_channel');
  });

  test('create and read document by ID (DOC-01)', async () => {
    const doc = await services.documents.create(tenantId, {
      channelId,
      title: 'Test Document',
      content: 'Hello, world!',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });

    expect(doc.id).toBeDefined();
    expect(doc.title).toBe('Test Document');
    expect(doc.content).toBe('Hello, world!');
    expect(doc.contentType).toBe('text');

    const fetched = services.documents.getById(tenantId, doc.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Test Document');
    expect(fetched!.content).toBe('Hello, world!');
  });

  test('list documents by channel returns all documents for that channel', async () => {
    await services.documents.create(tenantId, {
      channelId,
      title: 'Doc 1',
      content: 'Content 1',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });
    await services.documents.create(tenantId, {
      channelId,
      title: 'Doc 2',
      content: 'Content 2',
      createdById: 'agent-2',
      createdByName: 'Agent Two',
      createdByType: 'agent',
    });

    const docs = services.documents.listByChannel(tenantId, channelId);
    expect(docs).toHaveLength(2);
    expect(docs.map(d => d.title)).toContain('Doc 1');
    expect(docs.map(d => d.title)).toContain('Doc 2');
  });

  test('update document changes content and updatedAt (DOC-02)', async () => {
    const doc = await services.documents.create(tenantId, {
      channelId,
      title: 'Original Title',
      content: 'Original Content',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });

    // Small delay to ensure updatedAt differs
    await new Promise(r => setTimeout(r, 10));

    const updated = await services.documents.update(tenantId, doc.id, {
      title: 'Updated Title',
      content: 'Updated Content',
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.content).toBe('Updated Content');
    expect(updated!.updatedAt >= doc.updatedAt).toBe(true);
  });

  test('update nonexistent document returns null', async () => {
    const result = await services.documents.update(tenantId, 'nonexistent-id', {
      title: 'New Title',
    });
    expect(result).toBeNull();
  });

  test('tenant isolation — documents from tenant A invisible to tenant B', async () => {
    const tenantB = await services.tenants.upsertByCodebasePath('other-project', '/other/path');

    const docA = await services.documents.create(tenantId, {
      channelId,
      title: 'Tenant A Doc',
      content: 'Secret A',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });

    // Tenant B cannot read tenant A's document
    const fromB = services.documents.getById(tenantB.id, docA.id);
    expect(fromB).toBeNull();

    // Tenant B list returns empty for tenant A's channel
    const listB = services.documents.listByChannel(tenantB.id, channelId);
    expect(listB).toHaveLength(0);

    // Tenant B cannot update tenant A's document
    const updateResult = await services.documents.update(tenantB.id, docA.id, { title: 'Hacked' });
    expect(updateResult).toBeNull();

    // Original still intact
    const original = services.documents.getById(tenantId, docA.id);
    expect(original!.title).toBe('Tenant A Doc');
  });

  test('document persists across database close/reopen (DOC-04)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'doc-persist-'));
    const dbPath = join(tmpDir, 'test.db');

    try {
      // Create document in first connection
      const inst1 = createDb(dbPath);
      const q1 = new WriteQueue();
      const svc1 = createServices(inst1, q1);
      const t1 = await svc1.tenants.upsertByCodebasePath('persist-test', '/persist');
      const ch1 = await svc1.channels.create(t1.id, { name: 'persist-channel' });
      const doc = await svc1.documents.create(t1.id, {
        channelId: ch1.id,
        title: 'Persistent Doc',
        content: 'Survives restart',
        createdById: 'agent-1',
        createdByName: 'Agent One',
        createdByType: 'agent',
      });
      inst1.close();

      // Reopen database — document should still be there
      const inst2 = createDb(dbPath);
      const q2 = new WriteQueue();
      const svc2 = createServices(inst2, q2);
      const fetched = svc2.documents.getById(t1.id, doc.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Persistent Doc');
      expect(fetched!.content).toBe('Survives restart');
      inst2.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('content_type defaults to text', async () => {
    const doc = await services.documents.create(tenantId, {
      channelId,
      title: 'Default Type',
      content: 'Plain text content',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });
    expect(doc.contentType).toBe('text');
  });

  test('content_type can be set to markdown', async () => {
    const doc = await services.documents.create(tenantId, {
      channelId,
      title: 'Markdown Doc',
      content: '# Heading\n\nParagraph',
      contentType: 'markdown',
      createdById: 'agent-1',
      createdByName: 'Agent One',
      createdByType: 'agent',
    });
    expect(doc.contentType).toBe('markdown');
  });
});
