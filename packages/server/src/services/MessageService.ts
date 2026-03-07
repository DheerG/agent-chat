import type { Message } from '@agent-chat/shared';
import type { createMessageQueries } from '../db/queries/messages.js';

type MessageQueries = ReturnType<typeof createMessageQueries>;

export interface PaginatedMessages {
  messages: Message[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

export interface SendMessageData {
  channelId: string;
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system' | 'hook';
  content: string;
  messageType?: 'text' | 'event' | 'hook';
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
}

export class MessageService {
  constructor(private q: MessageQueries) {}

  async send(tenantId: string, data: SendMessageData): Promise<Message> {
    return this.q.insertMessage(tenantId, data);
  }

  list(
    tenantId: string,
    channelId: string,
    opts: { limit?: number; before?: string; after?: string } = {}
  ): PaginatedMessages {
    const limit = opts.limit ?? 50;
    // Fetch limit+1 to detect if there are more results beyond this page
    const rows = this.q.getMessages(tenantId, channelId, {
      limit: limit + 1,
      before: opts.before,
      after: opts.after,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      messages: items,
      pagination: {
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        prevCursor: items[0]?.id,
      },
    };
  }

  getById(tenantId: string, messageId: string): Message | null {
    return this.q.getMessageById(tenantId, messageId);
  }
}
