import { Hono } from 'hono';
import type { Services } from '../../services/index.js';

export function conversationRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/conversations?tab=active|recent|all&limit=50
  router.get('/', (c) => {
    const tab = (c.req.query('tab') ?? 'active') as 'active' | 'recent' | 'all';
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
    const items = services.conversations.listWithSummaries(tab, limit);
    return c.json({ conversations: items });
  });

  // GET /api/conversations/:id
  router.get('/:id', (c) => {
    const id = c.req.param('id');
    const conversation = services.conversations.getById(id);
    if (!conversation) return c.json({ error: 'Not found' }, 404);

    const summary = services.conversations.getSummary(id);
    const sessions = services.sessions.getByConversation(id);
    return c.json({ conversation, summary, sessions });
  });

  // GET /api/conversations/:id/feed?limit=50&after=cursor
  router.get('/:id/feed', (c) => {
    const id = c.req.param('id');
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
    const after = c.req.query('after');

    const conversation = services.conversations.getById(id);
    if (!conversation) return c.json({ error: 'Not found' }, 404);

    const { messages, pagination } = services.messages.list(id, { limit, after });

    const items = messages.map(msg => ({
      type: 'message' as const,
      ...msg,
    }));

    return c.json({ items, pagination });
  });

  // PATCH /api/conversations/:id/archive
  router.patch('/:id/archive', async (c) => {
    const id = c.req.param('id');
    await services.conversations.archive(id);
    return c.json({ success: true });
  });

  // PATCH /api/conversations/:id/restore
  router.patch('/:id/restore', async (c) => {
    const id = c.req.param('id');
    await services.conversations.restore(id);
    return c.json({ success: true });
  });

  return router;
}
