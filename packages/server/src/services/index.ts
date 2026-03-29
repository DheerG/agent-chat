import type { EventEmitter } from 'events';
import type { DbInstance } from '../db/index.js';
import type { WriteQueue } from '../db/queue.js';
import { createConversationQueries } from '../db/queries/conversations.js';
import { createSessionQueries } from '../db/queries/sessions.js';
import { createMessageQueries } from '../db/queries/messages.js';
import { createActivityEventQueries } from '../db/queries/activity-events.js';
import { createDocumentQueries } from '../db/queries/documents.js';
import { ConversationService } from './ConversationService.js';
import { SessionService } from './SessionService.js';
import { MessageService } from './MessageService.js';
import { ActivityEventService } from './ActivityEventService.js';
import { DocumentService } from './DocumentService.js';

export { ConversationService } from './ConversationService.js';
export { SessionService } from './SessionService.js';
export { MessageService } from './MessageService.js';
export { ActivityEventService } from './ActivityEventService.js';
export { DocumentService } from './DocumentService.js';
export type { SendMessageData, PaginatedMessages } from './MessageService.js';
export type { CreateDocumentData, UpdateDocumentData } from './DocumentService.js';

export interface Services {
  conversations: ConversationService;
  sessions: SessionService;
  messages: MessageService;
  activityEvents: ActivityEventService;
  documents: DocumentService;
}

export function createServices(
  instance: DbInstance,
  queue: WriteQueue,
  emitter?: EventEmitter,
): Services {
  const conversationQ = createConversationQueries(instance, queue);
  const sessionQ = createSessionQueries(instance, queue);
  const messageQ = createMessageQueries(instance, queue);
  const activityQ = createActivityEventQueries(instance, queue);
  const documentQ = createDocumentQueries(instance, queue);

  return {
    conversations: new ConversationService(conversationQ),
    sessions: new SessionService(sessionQ),
    messages: new MessageService(messageQ, emitter),
    activityEvents: new ActivityEventService(activityQ, emitter),
    documents: new DocumentService(documentQ, emitter),
  };
}
