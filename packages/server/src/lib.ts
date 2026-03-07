// packages/server/src/lib.ts — library exports for MCP and other consumers
// This file provides side-effect-free access to the server's data layer.
// Use this instead of index.ts which starts the HTTP server.

export { createDb, getDb, closeDb } from './db/index.js';
export type { DbInstance } from './db/index.js';
export { WriteQueue } from './db/queue.js';
export { createServices } from './services/index.js';
export type { Services } from './services/index.js';
export { TenantService } from './services/TenantService.js';
export { ChannelService } from './services/ChannelService.js';
export { MessageService } from './services/MessageService.js';
export { PresenceService } from './services/PresenceService.js';
export type { PaginatedMessages, SendMessageData } from './services/MessageService.js';
export { createApp } from './http/app.js';
export { dispatchHookEvent } from './hooks/handlers.js';
export type { HookPayload, HookResult } from './hooks/handlers.js';
