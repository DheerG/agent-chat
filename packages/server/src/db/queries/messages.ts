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

  };
}
