import type { EventEmitter } from 'events';
import type { DbInstance } from '../db/index.js';
import type { WriteQueue } from '../db/queue.js';
import { createConversationQueries } from '../db/queries/conversations.js';
import { createSessionQueries } from '../db/queries/sessions.js';
import { createMessageQueries } from '../db/queries/messages.js';
import { ConversationService } from './ConversationService.js';
import { SessionService } from './SessionService.js';
import { MessageService } from './MessageService.js';

export { ConversationService } from './ConversationService.js';
export { SessionService } from './SessionService.js';
export { MessageService } from './MessageService.js';
export type { SendMessageData, PaginatedMessages } from './MessageService.js';

export interface Services {
  conversations: ConversationService;
  sessions: SessionService;
  messages: MessageService;
}

export function createServices(
  instance: DbInstance,
  queue: WriteQueue,
  emitter?: EventEmitter,
): Services {
  const conversationQ = createConversationQueries(instance, queue);
  const sessionQ = createSessionQueries(instance, queue);
  const messageQ = createMessageQueries(instance, queue);

  return {
    conversations: new ConversationService(conversationQ),
    sessions: new SessionService(sessionQ),
    messages: new MessageService(messageQ, emitter),
  };
}
