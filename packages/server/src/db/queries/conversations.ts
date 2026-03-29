import { eq, and, asc, desc, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { conversations, conversationSummaries } from '@agent-chat/shared';
import type { Conversation, ConversationRow, ConversationSummaryRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    name: row.name,
    workspacePath: row.workspacePath,
    workspaceName: row.workspaceName,
    type: row.type,
    status: row.status,
    attentionNeeded: row.attentionNeeded === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function createConversationQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

  return {
    async create(data: {
      name: string;
      workspacePath?: string;
      workspaceName?: string;
      type?: 'team' | 'solo';
    }): Promise<Conversation> {
      const id = ulid();
      const now = new Date().toISOString();

      await queue.enqueue(() => {
        db.insert(conversations).values({
          id,
          name: data.name,
          workspacePath: data.workspacePath ?? null,
          workspaceName: data.workspaceName ?? null,
          type: data.type ?? 'team',
          status: 'active',
          attentionNeeded: 0,
          createdAt: now,
          updatedAt: now,
        }).run();

        // Initialize summary row
        db.insert(conversationSummaries).values({
          conversationId: id,
          startedAt: now,
          updatedAt: now,
        }).run();
      });

      return {
        id,
        name: data.name,
        workspacePath: data.workspacePath ?? null,
        workspaceName: data.workspaceName ?? null,
        type: data.type ?? 'team',
        status: 'active',
        attentionNeeded: false,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
    },

    getById(id: string): Conversation | null {
      const row = db.select().from(conversations).where(eq(conversations.id, id)).get();
      return row ? rowToConversation(row) : null;
    },

    findByName(name: string): Conversation | null {
      const row = db.select().from(conversations)
        .where(and(eq(conversations.name, name), isNull(conversations.archivedAt)))
        .get();
      return row ? rowToConversation(row) : null;
    },

    findByNamePrefix(prefix: string): Conversation[] {
      const rows = rawDb.prepare(
        `SELECT * FROM conversations WHERE name LIKE ? AND archived_at IS NULL ORDER BY created_at DESC`
      ).all(`${prefix}%`) as ConversationRow[];
      return rows.map(r => rowToConversation(r));
    },

    listActive(): Conversation[] {
      return db.select().from(conversations)
        .where(and(
          isNull(conversations.archivedAt),
          inArray(conversations.status, ['active', 'idle', 'error']),
        ))
        .orderBy(desc(conversations.updatedAt))
        .all()
        .map(rowToConversation);
    },

    listRecent(limit = 50): Conversation[] {
      return db.select().from(conversations)
        .where(isNull(conversations.archivedAt))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .all()
        .map(rowToConversation);
    },

    listAll(limit = 50): Conversation[] {
      return db.select().from(conversations)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .all()
        .map(rowToConversation);
    },

    async updateStatus(id: string, status: Conversation['status']): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.update(conversations)
          .set({ status, updatedAt: now })
          .where(eq(conversations.id, id))
          .run()
      );
    },

    async setAttentionNeeded(id: string, needed: boolean): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.update(conversations)
          .set({ attentionNeeded: needed ? 1 : 0, updatedAt: now })
          .where(eq(conversations.id, id))
          .run()
      );
    },

    async archive(id: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.update(conversations)
          .set({ archivedAt: now, updatedAt: now })
          .where(eq(conversations.id, id))
          .run()
      );
    },

    async restore(id: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.update(conversations)
          .set({ archivedAt: null, updatedAt: now })
          .where(eq(conversations.id, id))
          .run()
      );
    },

    getSummary(conversationId: string): ConversationSummaryRow | null {
      return db.select().from(conversationSummaries)
        .where(eq(conversationSummaries.conversationId, conversationId))
        .get() ?? null;
    },

    getAllSummaries(conversationIds: string[]): ConversationSummaryRow[] {
      if (conversationIds.length === 0) return [];
      return db.select().from(conversationSummaries)
        .where(inArray(conversationSummaries.conversationId, conversationIds))
        .all();
    },

    async updateSummary(conversationId: string, updates: Partial<{
      totalEvents: number;
      totalErrors: number;
      filesTouchedCount: number;
      lastEventAt: string;
      totalMessages: number;
      lastMessageAt: string;
      lastMessagePreview: string;
      lastMessageSender: string;
      activeSessionCount: number;
      totalSessionCount: number;
      hasStopEvent: number;
      hasError: number;
      startedAt: string;
      endedAt: string;
      status: string;
    }>): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.update(conversationSummaries)
          .set({ ...updates, updatedAt: now })
          .where(eq(conversationSummaries.conversationId, conversationId))
          .run()
      );
    },

    async incrementSummaryEvents(conversationId: string, isError: boolean): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() => {
        if (isError) {
          rawDb.prepare(`
            UPDATE conversation_summaries
            SET total_events = total_events + 1, total_errors = total_errors + 1,
                has_error = 1, last_event_at = ?, status = 'error', updated_at = ?
            WHERE conversation_id = ?
          `).run(now, now, conversationId);
        } else {
          rawDb.prepare(`
            UPDATE conversation_summaries
            SET total_events = total_events + 1, last_event_at = ?, updated_at = ?
            WHERE conversation_id = ?
          `).run(now, now, conversationId);
        }
      });
    },

    async incrementSummaryMessages(conversationId: string, preview: string, sender: string, timestamp?: string): Promise<void> {
      const ts = timestamp ?? new Date().toISOString();
      const truncated = preview.slice(0, 120);
      await queue.enqueue(() =>
        rawDb.prepare(`
          UPDATE conversation_summaries
          SET total_messages = total_messages + 1,
              last_message_at = MAX(COALESCE(last_message_at, ''), ?),
              last_message_preview = ?, last_message_sender = ?,
              updated_at = MAX(COALESCE(updated_at, ''), ?)
          WHERE conversation_id = ?
        `).run(ts, truncated, sender, ts, conversationId)
      );
    },

    async incrementSessionCount(conversationId: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        rawDb.prepare(`
          UPDATE conversation_summaries
          SET active_session_count = active_session_count + 1,
              total_session_count = total_session_count + 1, updated_at = ?
          WHERE conversation_id = ?
        `).run(now, conversationId)
      );
    },

    async decrementActiveSessionCount(conversationId: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        rawDb.prepare(`
          UPDATE conversation_summaries
          SET active_session_count = MAX(0, active_session_count - 1), updated_at = ?
          WHERE conversation_id = ?
        `).run(now, conversationId)
      );
    },

    async setStopEvent(conversationId: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        rawDb.prepare(`
          UPDATE conversation_summaries
          SET has_stop_event = 1, ended_at = ?, updated_at = ?
          WHERE conversation_id = ?
        `).run(now, now, conversationId)
      );
    },
  };
}
