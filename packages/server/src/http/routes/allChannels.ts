import { Hono } from 'hono';
import type { Services } from '../../services/index.js';

export function allChannelRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/channels/recent — list recent channels across ALL tenants
  router.get('/recent', (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : 100;
    const channels = services.channels.listRecentAcrossTenants(limit);
    return c.json({ channels });
  });

  return router;
}
