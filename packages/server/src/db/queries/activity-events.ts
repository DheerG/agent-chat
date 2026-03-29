import { eq, and, asc, gt, lt } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { activityEvents } from '@agent-chat/shared';
import type { ActivityEvent, ActivityEventRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToEvent(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sessionId: row.sessionId,
    eventType: row.eventType,
    toolName: row.toolName,
    filePaths: row.filePaths ? JSON.parse(row.filePaths) as string[] : null,
    isError: row.isError === 1,
    summary: row.summary,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export function createActivityEventQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

  return {
    async insert(data: {
      conversationId: string;
      sessionId: string;
      eventType: ActivityEvent['eventType'];
      toolName?: string;
      filePaths?: string[];
      isError?: boolean;
      summary?: string;
      metadata?: Record<string, unknown>;
    }): Promise<ActivityEvent> {
      const id = ulid();
      const createdAt = new Date().toISOString();

      await queue.enqueue(() =>
        db.insert(activityEvents).values({
          id,
          conversationId: data.conversationId,
          sessionId: data.sessionId,
          eventType: data.eventType,
          toolName: data.toolName ?? null,
          filePaths: data.filePaths ? JSON.stringify(data.filePaths) : null,
          isError: data.isError ? 1 : 0,
          summary: data.summary ?? null,
          metadata: JSON.stringify(data.metadata ?? {}),
          createdAt,
        }).run()
      );

      return {
        id,
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        eventType: data.eventType,
        toolName: data.toolName ?? null,
        filePaths: data.filePaths ?? null,
        isError: data.isError ?? false,
        summary: data.summary ?? null,
        metadata: data.metadata ?? {},
        createdAt,
      };
    },

    getByConversation(conversationId: string, opts: { after?: string; before?: string; limit?: number } = {}): ActivityEvent[] {
      const limit = opts.limit ?? 100;
      const conditions = [eq(activityEvents.conversationId, conversationId)];
      if (opts.after) conditions.push(gt(activityEvents.id, opts.after));
      if (opts.before) conditions.push(lt(activityEvents.id, opts.before));

      return db.select().from(activityEvents)
        .where(and(...conditions))
        .orderBy(asc(activityEvents.id))
        .limit(limit)
        .all()
        .map(rowToEvent);
    },

    getBySession(sessionId: string, opts: { after?: string; limit?: number } = {}): ActivityEvent[] {
      const limit = opts.limit ?? 100;
      const conditions = [eq(activityEvents.sessionId, sessionId)];
      if (opts.after) conditions.push(gt(activityEvents.id, opts.after));

      return db.select().from(activityEvents)
        .where(and(...conditions))
        .orderBy(asc(activityEvents.id))
        .limit(limit)
        .all()
        .map(rowToEvent);
    },

    async backfillConversation(sessionIds: string[], conversationId: string): Promise<number> {
      if (sessionIds.length === 0) return 0;
      const placeholders = sessionIds.map(() => '?').join(',');
      const result = await queue.enqueue(() =>
        rawDb.prepare(`
          UPDATE activity_events SET conversation_id = ?
          WHERE session_id IN (${placeholders}) AND conversation_id = ''
        `).run(conversationId, ...sessionIds)
      );
      return result.changes;
    },

    getEventCountSince(conversationId: string, since: string): { total: number; errors: number } {
      const result = rawDb.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as errors
        FROM activity_events
        WHERE conversation_id = ? AND created_at > ?
      `).get(conversationId, since) as { total: number; errors: number };
      return { total: result.total, errors: result.errors ?? 0 };
    },
  };
}
