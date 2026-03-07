import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import type { DbInstance, Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import { handleCreateDocument } from '../tools/create-document.js';
import { handleReadDocument } from '../tools/read-document.js';
import { handleUpdateDocument } from '../tools/update-document.js';
import { handleListDocuments } from '../tools/list-documents.js';

describe('MCP Document Tool Handlers', () => {
  let instance: DbInstance;
  let services: Services;
  let tenantId: string;
  let channelId: string;

  const config: McpConfig = {
    dbPath: ':memory:',
    tenantId: 'auto',
    agentId: 'test-agent-001',
    agentName: 'Test Agent',
  };

  beforeEach(async () => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);
    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/docs');
    tenantId = tenant.id;
    const channel = await services.channels.create(tenantId, { name: 'doc-channel' });
    channelId = channel.id;
  });

  describe('create_document', () => {
    it('creates document with correct author identity from config (DOC-01)', async () => {
      const result = await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Agent Doc',
        content: 'Created by agent',
      });

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Agent Doc');
      expect(result.channelId).toBe(channelId);

      const doc = services.documents.getById(tenantId, result.id);
      expect(doc).not.toBeNull();
      expect(doc!.createdById).toBe('test-agent-001');
      expect(doc!.createdByName).toBe('Test Agent');
      expect(doc!.createdByType).toBe('agent');
    });

    it('supports content_type parameter', async () => {
      const result = await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'MD Doc',
        content: '# Hello',
        content_type: 'markdown',
      });

      const doc = services.documents.getById(tenantId, result.id);
      expect(doc!.contentType).toBe('markdown');
    });
  });

  describe('read_document', () => {
    it('reads document created by another agent (DOC-01)', async () => {
      const created = await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Shared Doc',
        content: 'Shared content',
      });

      const result = handleReadDocument(services, tenantId, {
        document_id: created.id,
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Shared Doc');
      expect(result!.content).toBe('Shared content');
      expect(result!.createdByName).toBe('Test Agent');
    });

    it('returns null for nonexistent document', () => {
      const result = handleReadDocument(services, tenantId, {
        document_id: 'nonexistent',
      });
      expect(result).toBeNull();
    });
  });

  describe('update_document', () => {
    it('updates document content (DOC-02)', async () => {
      const created = await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Original',
        content: 'Original content',
      });

      const result = await handleUpdateDocument(services, tenantId, {
        document_id: created.id,
        content: 'Updated content',
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Original');

      const doc = services.documents.getById(tenantId, created.id);
      expect(doc!.content).toBe('Updated content');
    });

    it('updates document title', async () => {
      const created = await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Old Title',
        content: 'Content',
      });

      const result = await handleUpdateDocument(services, tenantId, {
        document_id: created.id,
        title: 'New Title',
      });

      expect(result!.title).toBe('New Title');
    });

    it('returns null for nonexistent document', async () => {
      const result = await handleUpdateDocument(services, tenantId, {
        document_id: 'nonexistent',
        content: 'update',
      });
      expect(result).toBeNull();
    });
  });

  describe('list_documents', () => {
    it('lists all documents for a channel', async () => {
      await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Doc 1',
        content: 'Content 1',
      });
      await handleCreateDocument(services, config, tenantId, {
        channel_id: channelId,
        title: 'Doc 2',
        content: 'Content 2',
      });

      const result = handleListDocuments(services, tenantId, {
        channel_id: channelId,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe('Doc 1');
      expect(result[1]!.title).toBe('Doc 2');
      // list_documents should NOT include content (metadata only)
      expect((result[0] as Record<string, unknown>)['content']).toBeUndefined();
    });

    it('returns empty array for channel with no documents', () => {
      const result = handleListDocuments(services, tenantId, {
        channel_id: channelId,
      });
      expect(result).toHaveLength(0);
    });
  });
});
