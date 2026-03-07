import { Hono } from 'hono';

export function healthRoutes(): Hono {
  const router = new Hono();
  router.get('/', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  return router;
}
