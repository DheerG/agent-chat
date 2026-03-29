import type { EventEmitter } from 'events';
import type { Message, PaginationOpts } from '@agent-chat/shared';
import type { createMessageQueries } from '../db/queries/messages.js';

type MessageQueries = ReturnType<typeof createMessageQueries>;

export interface SendMessageData {
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system';
  content: string;
  messageType?: 'text' | 'status' | 'error' | 'input_request' | 'system';
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaginatedMessages {
  messages: Message[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

export class MessageService {
  constructor(
    private q: MessageQueries,
    private emitter?: EventEmitter,
  ) {}

  async send(conversationId: string, data: SendMessageData): Promise<Message> {
    const message = await this.q.insertMessage(conversationId, {
      senderId: data.senderId,
      senderName: data.senderName,
      senderType: data.senderType,
      content: data.content,
      messageType: data.messageType ?? 'text',
      parentMessageId: data.parentMessageId,
      metadata: data.metadata,
    });

    this.emitter?.emit('message:created', message);
    return message;
  }

  list(conversationId: string, opts: PaginationOpts = {}): PaginatedMessages {
    const limit = opts.limit ?? 50;
    const messages = this.q.getMessages(conversationId, { ...opts, limit: limit + 1 });
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      messages,
      pagination: {
        hasMore,
        nextCursor: hasMore && messages.length > 0 ? messages[messages.length - 1]!.id : null,
      },
    };
  }

  getById(conversationId: string, messageId: string): Message | null {
    return this.q.getMessageById(conversationId, messageId);
  }

  getThreadReplies(conversationId: string, parentMessageId: string): Message[] {
    return this.q.getThreadReplies(conversationId, parentMessageId);
  }

  getMessagesSince(conversationId: string, since: string, limit = 200): Message[] {
    return this.q.getMessagesSince(conversationId, since, limit);
  }

  getMessageCount(conversationId: string): number {
    return this.q.getMessageCount(conversationId);
  }
}
