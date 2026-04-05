import { eq } from 'drizzle-orm';
import type { DbInstance } from '../index.js';
import { sessions } from '@agent-chat/shared';
import type { Session, SessionRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    conversationId: row.conversationId,
    agentName: row.agentName,
    agentType: row.agentType as Session['agentType'],
    model: row.model,
    cwd: row.cwd,
    status: row.status as Session['status'],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    parentSessionId: row.parentSessionId,
  };
}

export function createSessionQueries(instance: DbInstance, queue: WriteQueue) {
  const { db } = instance;

  return {
    async upsert(data: {
      id: string;
      conversationId?: string;
      agentName?: string;
      agentType?: Session['agentType'];
      model?: string;
      cwd?: string;
      status?: Session['status'];
      parentSessionId?: string;
    }): Promise<Session> {
      const now = new Date().toISOString();
      const existing = db.select().from(sessions).where(eq(sessions.id, data.id)).get();

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (data.conversationId !== undefined) updates.conversationId = data.conversationId;
        if (data.agentName !== undefined) updates.agentName = data.agentName;
        if (data.agentType !== undefined) updates.agentType = data.agentType;
        if (data.model !== undefined) updates.model = data.model;
        if (data.cwd !== undefined) updates.cwd = data.cwd;
        if (data.status !== undefined) updates.status = data.status;
        if (data.parentSessionId !== undefined) updates.parentSessionId = data.parentSessionId;

        if (Object.keys(updates).length > 0) {
          await queue.enqueue(() =>
            db.update(sessions).set(updates).where(eq(sessions.id, data.id)).run()
          );
        }

        const updated = db.select().from(sessions).where(eq(sessions.id, data.id)).get()!;
        return rowToSession(updated);
      }

      await queue.enqueue(() =>
        db.insert(sessions).values({
          id: data.id,
          conversationId: data.conversationId ?? null,
          agentName: data.agentName ?? null,
          agentType: data.agentType ?? null,
          model: data.model ?? null,
          cwd: data.cwd ?? null,
          status: data.status ?? 'active',
          startedAt: now,
          parentSessionId: data.parentSessionId ?? null,
        }).run()
      );

      return {
        id: data.id,
        conversationId: data.conversationId ?? null,
        agentName: data.agentName ?? null,
        agentType: data.agentType as Session['agentType'] ?? null,
        model: data.model ?? null,
        cwd: data.cwd ?? null,
        status: data.status ?? 'active',
        startedAt: now,
        endedAt: null,
        parentSessionId: data.parentSessionId ?? null,
      };
    },

    getByConversation(conversationId: string): Session[] {
      return db.select().from(sessions)
        .where(eq(sessions.conversationId, conversationId))
        .all()
        .map(rowToSession);
    },
  };
}
