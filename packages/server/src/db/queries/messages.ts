import { eq, and, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { messages } from '@agent-chat/shared';
import type { Message, MessageRow, PaginationOpts } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channelId,
    tenantId: row.tenantId,
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
  const { db } = instance;

  return {
    // Messages are APPEND-ONLY — no updateMessage or deleteMessage exported
    async insertMessage(
      tenantId: string,
      data: {
        channelId: string;
        senderId: string;
        senderName: string;
        senderType: 'agent' | 'human' | 'system' | 'hook';
        content: string;
        messageType?: 'text' | 'event' | 'hook';
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
          channelId: data.channelId,
          tenantId,
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
        channelId: data.channelId,
        tenantId,
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

    // tenantId is FIRST argument — cross-tenant queries structurally impossible
    getMessages(
      tenantId: string,
      channelId: string,
      _opts?: PaginationOpts
    ): Message[] {
      return db.select().from(messages)
        .where(and(eq(messages.tenantId, tenantId), eq(messages.channelId, channelId)))
        .orderBy(asc(messages.id))  // ULID lexicographic = chronological order
        .all()
        .map(rowToMessage);
    },

    getMessageById(tenantId: string, messageId: string): Message | null {
      const row = db.select().from(messages)
        .where(and(eq(messages.tenantId, tenantId), eq(messages.id, messageId)))
        .get();
      return row ? rowToMessage(row) : null;
    },

    getThreadReplies(tenantId: string, parentMessageId: string): Message[] {
      return db.select().from(messages)
        .where(and(
          eq(messages.tenantId, tenantId),
          eq(messages.parentMessageId, parentMessageId)
        ))
        .orderBy(asc(messages.id))
        .all()
        .map(rowToMessage);
    },
  };
}
