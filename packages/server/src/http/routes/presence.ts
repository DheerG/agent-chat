import { Hono } from 'hono';
import type { Services } from '../../services/index.js';

export function presenceRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/tenants/:tenantId/channels/:channelId/presence
  router.get('/', (c) => {
    const tenantId = c.req.param('tenantId') as string;
    const channelId = c.req.param('channelId') as string;
    if (!services.tenants.getById(tenantId)) {
      return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    }
    if (!services.channels.getById(tenantId, channelId)) {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }
    const presenceList = services.presence.getByChannel(tenantId, channelId);
    return c.json({ presence: presenceList });
  });

  return router;
}
