import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ─── Conversations ──────────────────────────────────────────────────
// Primary entity: one conversation per team run or materialized solo session.

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  workspacePath: text('workspace_path'),
  workspaceName: text('workspace_name'),
  type: text('type', { enum: ['team', 'solo'] }).notNull().default('team'),
  status: text('status', { enum: ['active', 'idle', 'completed', 'inactive', 'error'] }).notNull().default('active'),
  attentionNeeded: integer('attention_needed').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
});

// ─── Sessions ───────────────────────────────────────────────────────
// Tracks individual Claude Code agent sessions linked to conversations.

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  agentName: text('agent_name'),
  agentType: text('agent_type', { enum: ['leader', 'teammate', 'sub-agent', 'solo'] }),
  model: text('model'),
  cwd: text('cwd'),
  status: text('status', { enum: ['pending', 'active', 'idle', 'stopped'] }).notNull().default('active'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  parentSessionId: text('parent_session_id'),
}, (t) => [
  index('idx_sessions_conversation').on(t.conversationId),
]);

// ─── Messages ───────────────────────────────────────────────────────
// Intentional communication only (MCP tools, team inbox, system, human).

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  parentMessageId: text('parent_message_id'),
  senderId: text('sender_id').notNull(),
  senderName: text('sender_name').notNull(),
  senderType: text('sender_type', { enum: ['agent', 'human', 'system'] }).notNull(),
  content: text('content').notNull(),
  messageType: text('message_type', { enum: ['text', 'status', 'error', 'input_request', 'system'] }).notNull().default('text'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_messages_conversation').on(t.conversationId, t.id),
  index('idx_messages_thread').on(t.parentMessageId),
]);

// ─── Activity Events ────────────────────────────────────────────────
// Passive telemetry from hook events. Separate from messages.

export const activityEvents = sqliteTable('activity_events', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  sessionId: text('session_id').notNull(),
  eventType: text('event_type', {
    enum: ['tool_use', 'session_start', 'session_end', 'stop', 'subagent_start', 'subagent_stop', 'user_prompt'],
  }).notNull(),
  toolName: text('tool_name'),
  filePaths: text('file_paths'),
  isError: integer('is_error').notNull().default(0),
  summary: text('summary'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_activity_conversation').on(t.conversationId, t.createdAt),
  index('idx_activity_session').on(t.sessionId, t.createdAt),
]);

// ─── Conversation Summaries ─────────────────────────────────────────
// Denormalized cache updated atomically on writes.

export const conversationSummaries = sqliteTable('conversation_summaries', {
  conversationId: text('conversation_id').primaryKey().references(() => conversations.id),
  totalEvents: integer('total_events').notNull().default(0),
  totalErrors: integer('total_errors').notNull().default(0),
  filesTouchedCount: integer('files_touched_count').notNull().default(0),
  lastEventAt: text('last_event_at'),
  totalMessages: integer('total_messages').notNull().default(0),
  lastMessageAt: text('last_message_at'),
  lastMessagePreview: text('last_message_preview'),
  lastMessageSender: text('last_message_sender'),
  activeSessionCount: integer('active_session_count').notNull().default(0),
  totalSessionCount: integer('total_session_count').notNull().default(0),
  hasStopEvent: integer('has_stop_event').notNull().default(0),
  hasError: integer('has_error').notNull().default(0),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  status: text('status').notNull().default('active'),
  updatedAt: text('updated_at').notNull(),
});

// ─── Documents ──────────────────────────────────────────────────────
// Persistent shared artifacts pinned to a conversation.

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  contentType: text('content_type', { enum: ['text', 'markdown', 'json'] }).notNull().default('text'),
  createdById: text('created_by_id').notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_documents_conversation').on(t.conversationId),
]);

// Drizzle-inferred types
export type ConversationRow = typeof conversations.$inferSelect;
export type ConversationInsert = typeof conversations.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type ActivityEventRow = typeof activityEvents.$inferSelect;
export type ActivityEventInsert = typeof activityEvents.$inferInsert;
export type ConversationSummaryRow = typeof conversationSummaries.$inferSelect;
export type ConversationSummaryInsert = typeof conversationSummaries.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
