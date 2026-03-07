import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

const CreateDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(''),
  contentType: z.enum(['text', 'markdown', 'json']).optional(),
  createdById: z.string().min(1),
  createdByName: z.string().min(1),
  createdByType: z.enum(['agent', 'human']).optional(),
});

const UpdateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
}).refine(data => data.title !== undefined || data.content !== undefined, {
  message: 'At least one of title or content must be provided',
});

export function documentRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/tenants/:tenantId/channels/:channelId/documents
  router.get('/', (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    if (!services.channels.getById(tenantId, channelId)) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }

    const docs = services.documents.listByChannel(tenantId, channelId);
    return c.json({ documents: docs });
  });

  // GET /api/tenants/:tenantId/channels/:channelId/documents/:documentId
  router.get('/:documentId', (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const documentId = c.req.param('documentId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }

    const doc = services.documents.getById(tenantId, documentId);
    if (!doc) {
      return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json({ document: doc });
  });

  // POST /api/tenants/:tenantId/channels/:channelId/documents
  router.post('/', async (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    if (!services.channels.getById(tenantId, channelId)) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }

    const result = CreateDocumentSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
    }

    const document = await services.documents.create(tenantId, {
      channelId,
      ...result.data,
      createdByType: result.data.createdByType ?? 'agent',
    });
    return c.json({ document }, 201);
  });

  // PUT /api/tenants/:tenantId/channels/:channelId/documents/:documentId
  router.put('/:documentId', async (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const documentId = c.req.param('documentId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }

    const result = UpdateDocumentSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
    }

    const updated = await services.documents.update(tenantId, documentId, result.data);
    if (!updated) {
      return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json({ document: updated });
  });

  return router;
}
