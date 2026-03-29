// Library exports for MCP and other consumers
export { createDb, getDb, closeDb } from './db/index.js';
export type { DbInstance } from './db/index.js';
export { WriteQueue } from './db/queue.js';
export { createServices } from './services/index.js';
export type { Services } from './services/index.js';
export { ConversationService } from './services/ConversationService.js';
export { SessionService } from './services/SessionService.js';
export { MessageService } from './services/MessageService.js';
export { ActivityEventService } from './services/ActivityEventService.js';
export { DocumentService } from './services/DocumentService.js';
export type { PaginatedMessages, SendMessageData } from './services/MessageService.js';
export type { CreateDocumentData, UpdateDocumentData } from './services/DocumentService.js';
export { createApp } from './http/app.js';
export { dispatchHookEvent, getPendingSessions } from './hooks/handlers.js';
export type { HookPayload, HookResult } from './hooks/handlers.js';
export { WebSocketHub } from './ws/index.js';
export { TeamInboxWatcher } from './watcher/index.js';
