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

    // Get messages
    const { messages, pagination } = services.messages.list(id, { limit, after });

    // Get activity events for batching
    const events = services.activityEvents.getByConversation(id, { after, limit: limit * 10 });

    // Interleave messages and event batches
    const items: Array<Record<string, unknown>> = [];
    let eventIdx = 0;

    for (const msg of messages) {
      // Insert any event batches before this message
      while (eventIdx < events.length && events[eventIdx]!.id < msg.id) {
        const batchStart = eventIdx;
        const batchSessionId = events[eventIdx]!.sessionId;
        const toolNames = new Set<string>();
        let errorCount = 0;

        // Group consecutive events from same session
        while (
          eventIdx < events.length &&
          events[eventIdx]!.sessionId === batchSessionId &&
          events[eventIdx]!.id < msg.id
        ) {
          const ev = events[eventIdx]!;
          if (ev.toolName) toolNames.add(ev.toolName);
          if (ev.isError) errorCount++;
          eventIdx++;
        }

        if (eventIdx > batchStart) {
          items.push({
            type: 'event_batch',
            id: events[batchStart]!.id,
            conversationId: id,
            sessionId: batchSessionId,
            count: eventIdx - batchStart,
            toolNames: [...toolNames],
            startTime: events[batchStart]!.createdAt,
            endTime: events[eventIdx - 1]!.createdAt,
            firstEventId: events[batchStart]!.id,
            lastEventId: events[eventIdx - 1]!.id,
            errorCount,
          });
        }
      }

      items.push({
        type: 'message',
        ...msg,
      });
    }

    // Remaining events after all messages
    while (eventIdx < events.length) {
      const batchStart = eventIdx;
      const batchSessionId = events[eventIdx]!.sessionId;
      const toolNames = new Set<string>();
      let errorCount = 0;

      while (eventIdx < events.length && events[eventIdx]!.sessionId === batchSessionId) {
        const ev = events[eventIdx]!;
        if (ev.toolName) toolNames.add(ev.toolName);
        if (ev.isError) errorCount++;
        eventIdx++;
      }

      items.push({
        type: 'event_batch',
        id: events[batchStart]!.id,
        conversationId: id,
        sessionId: batchSessionId,
        count: eventIdx - batchStart,
        toolNames: [...toolNames],
        startTime: events[batchStart]!.createdAt,
        endTime: events[eventIdx - 1]!.createdAt,
        firstEventId: events[batchStart]!.id,
        lastEventId: events[eventIdx - 1]!.id,
        errorCount,
      });
    }

    return c.json({ items, pagination });
  });

  // GET /api/conversations/:id/events?after=&before=&limit=
  router.get('/:id/events', (c) => {
    const id = c.req.param('id');
    const after = c.req.query('after');
    const before = c.req.query('before');
    const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);

    const events = services.activityEvents.getByConversation(id, { after, before, limit });
    return c.json({ events });
  });

  // POST /api/conversations/:id/messages
  router.post('/:id/messages', async (c) => {
    const id = c.req.param('id');
    const conversation = services.conversations.getById(id);
    if (!conversation) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json() as {
      content: string;
      senderName?: string;
      parentMessageId?: string;
    };

    const message = await services.messages.send(id, {
      senderId: 'human',
      senderName: body.senderName ?? 'Human',
      senderType: 'human',
      content: body.content,
      parentMessageId: body.parentMessageId,
    });

    await services.conversations.incrementMessages(id, body.content, body.senderName ?? 'Human');

    // Clear attention_needed if set
    if (conversation.attentionNeeded) {
      await services.conversations.setAttentionNeeded(id, false);
    }

    return c.json({ message }, 201);
  });

  // GET /api/conversations/:id/documents
  router.get('/:id/documents', (c) => {
    const id = c.req.param('id');
    const docs = services.documents.listByConversation(id);
    return c.json({ documents: docs });
  });

  // POST /api/conversations/:id/documents
  router.post('/:id/documents', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json() as {
      title: string;
      content: string;
      contentType?: 'text' | 'markdown' | 'json';
      createdById: string;
      createdByName: string;
    };

    const doc = await services.documents.create(id, body);
    return c.json({ document: doc }, 201);
  });

  // GET /api/conversations/:id/documents/:docId
  router.get('/:id/documents/:docId', (c) => {
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    const doc = services.documents.getById(id, docId);
    if (!doc) return c.json({ error: 'Not found' }, 404);
    return c.json({ document: doc });
  });

  // PUT /api/conversations/:id/documents/:docId
  router.put('/:id/documents/:docId', async (c) => {
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    const body = await c.req.json() as { title?: string; content?: string };
    const doc = await services.documents.update(id, docId, body);
    if (!doc) return c.json({ error: 'Not found' }, 404);
    return c.json({ document: doc });
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
