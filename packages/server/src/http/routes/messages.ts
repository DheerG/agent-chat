import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

const SendMessageSchema = z.object({
  senderId: z.string().min(1),
  senderName: z.string().min(1),
  senderType: z.enum(['agent', 'human', 'system', 'hook']),
  content: z.string().min(1),
  messageType: z.enum(['text', 'event', 'hook']).optional(),
  parentMessageId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const MessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
  after: z.string().optional(),
});

export function messageRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/tenants/:tenantId/channels/:channelId/messages
  router.get('/', (c) => {
    // Hono propagates ancestor path params; non-null assertions are safe here —
    // these params are always present when routed via /api/tenants/:tenantId/channels/:channelId/messages
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    if (!services.channels.getById(tenantId, channelId)) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }

    const queryResult = MessageQuerySchema.safeParse({
      limit: c.req.query('limit'),
      before: c.req.query('before'),
      after: c.req.query('after'),
    });
    if (!queryResult.success) {
      return c.json({ error: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: queryResult.error.issues }, 422);
    }

    const result = services.messages.list(tenantId, channelId, queryResult.data);
    return c.json(result);
  });

  // POST /api/tenants/:tenantId/channels/:channelId/messages
  router.post('/', async (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;

    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    const channel = services.channels.getById(tenantId, channelId);
    if (!channel) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }
    if (channel.archivedAt) {
      // Auto-restore: new activity overrides archive state
      await services.channels.restore(tenantId, channelId);

      // Also restore parent tenant if archived
      const tenant = services.tenants.getById(tenantId);
      if (tenant?.archivedAt) {
        await services.tenants.restore(tenantId);
      }

      console.log(JSON.stringify({
        event: 'auto_restore_channel',
        channelId,
        tenantId,
        trigger: 'message',
      }));
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }
    const result = SendMessageSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
    }

    const message = await services.messages.send(tenantId, { channelId, ...result.data });
    return c.json({ message }, 201);
  });

  return router;
}
