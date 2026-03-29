import { eq, and, asc, lt, gt } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { messages } from '@agent-chat/shared';
import type { Message, MessageRow, PaginationOpts } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    parentMessageId: row.parentMessageId,
    senderId: row.senderId,
    senderName: row.senderName,
    senderType: row.senderType,
    content: row.content,
    messageType: row.messageType,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export function createMessageQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

  return {
    async insertMessage(
      conversationId: string,
      data: {
        senderId: string;
        senderName: string;
        senderType: 'agent' | 'human' | 'system';
        content: string;
        messageType?: 'text' | 'status' | 'error' | 'input_request' | 'system';
        parentMessageId?: string;
        metadata?: Record<string, unknown>;
      }
    ): Promise<Message> {
      const id = ulid();
      const createdAt = new Date().toISOString();
      const metadata = JSON.stringify(data.metadata ?? {});

      await queue.enqueue(() =>
        db.insert(messages).values({
          id,
          conversationId,
          parentMessageId: data.parentMessageId ?? null,
          senderId: data.senderId,
          senderName: data.senderName,
          senderType: data.senderType,
          content: data.content,
          messageType: data.messageType ?? 'text',
          metadata,
          createdAt,
        }).run()
      );

      return {
        id,
        conversationId,
        parentMessageId: data.parentMessageId ?? null,
        senderId: data.senderId,
        senderName: data.senderName,
        senderType: data.senderType,
        content: data.content,
        messageType: data.messageType ?? 'text',
        metadata: data.metadata ?? {},
        createdAt,
      };
    },

    getMessages(conversationId: string, opts: PaginationOpts = {}): Message[] {
      const limit = opts.limit ?? 50;
      const conditions = [eq(messages.conversationId, conversationId)];

      if (opts.before) conditions.push(lt(messages.id, opts.before));
      if (opts.after) conditions.push(gt(messages.id, opts.after));

      return db.select().from(messages)
        .where(and(...conditions))
        .orderBy(asc(messages.id))
        .limit(limit)
        .all()
        .map(rowToMessage);
    },

    getMessageById(conversationId: string, messageId: string): Message | null {
      const row = db.select().from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.id, messageId)))
        .get();
      return row ? rowToMessage(row) : null;
    },

    getThreadReplies(conversationId: string, parentMessageId: string): Message[] {
      return db.select().from(messages)
        .where(and(
          eq(messages.conversationId, conversationId),
          eq(messages.parentMessageId, parentMessageId)
        ))
        .orderBy(asc(messages.id))
        .all()
        .map(rowToMessage);
    },

    getMessagesSince(conversationId: string, since: string, limit = 200): Message[] {
      interface RawRow {
        id: string; conversation_id: string; parent_message_id: string | null;
        sender_id: string; sender_name: string; sender_type: string;
        content: string; message_type: string; metadata: string; created_at: string;
      }
      const rows = rawDb.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND created_at > ?
        ORDER BY id ASC LIMIT ?
      `).all(conversationId, since, limit) as RawRow[];
      return rows.map(r => ({
        id: r.id,
        conversationId: r.conversation_id,
        parentMessageId: r.parent_message_id,
        senderId: r.sender_id,
        senderName: r.sender_name,
        senderType: r.sender_type as Message['senderType'],
        content: r.content,
        messageType: r.message_type as Message['messageType'],
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
        createdAt: r.created_at,
      }));
    },

    getMessageCount(conversationId: string): number {
      const result = rawDb.prepare(
        `SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?`
      ).get(conversationId) as { cnt: number };
      return result.cnt;
    },
  };
}
