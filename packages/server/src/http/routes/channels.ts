import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

const CreateChannelSchema = z.object({
  name: z.string().min(1),
  sessionId: z.string().optional(),
  type: z.enum(['session', 'manual']).optional(),
});

export function channelRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/tenants/:tenantId/channels
  router.get('/', (c) => {
    // Hono propagates ancestor path params; non-null assertion is safe here —
    // this route is only reachable via /api/tenants/:tenantId/channels
    const tenantId = c.req.param('tenantId') as string;
    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    const channelList = services.channels.listByTenant(tenantId);
    return c.json({ channels: channelList });
  });

  // POST /api/tenants/:tenantId/channels
  router.post('/', async (c) => {
    const tenantId = c.req.param('tenantId') as string;
    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }
    const result = CreateChannelSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
    }
    const channel = await services.channels.create(tenantId, result.data);
    return c.json({ channel }, 201);
  });

  // GET /api/tenants/:tenantId/channels/:channelId
  router.get('/:channelId', (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;
    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    const channel = services.channels.getById(tenantId, channelId);
    if (!channel) return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    return c.json({ channel });
  });

  return router;
}
