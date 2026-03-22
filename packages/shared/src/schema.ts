import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// NOTE: Drizzle SQLite does not support native partial indexes (WHERE clause).
// The thread index will index all rows including NULL parent_message_id —
// acceptable for this scale. The composite index is the primary query path.

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),                    // ULID — 26 chars, lexicographic
  name: text('name').notNull(),
  codebasePath: text('codebase_path').notNull(),  // unique — project root path
  createdAt: text('created_at').notNull(),        // ISO 8601
  archivedAt: text('archived_at'),               // nullable — NULL = active, ISO 8601 = archived
  userArchived: text('user_archived'),           // '1' when user explicitly archived, null otherwise
}, (t) => [
  uniqueIndex('idx_tenants_codebase_path').on(t.codebasePath),
]);

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),                    // ULID
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  sessionId: text('session_id'),                  // nullable — null for manual channels
  type: text('type', { enum: ['session', 'manual'] }).notNull().default('manual'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),               // nullable — NULL = active, ISO 8601 = archived
  userArchived: text('user_archived'),           // '1' when user explicitly archived, null otherwise
}, (t) => [
  index('idx_channels_tenant').on(t.tenantId),
]);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),                    // ULID — lexicographic = chronological
  channelId: text('channel_id').notNull().references(() => channels.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),  // denormalized
  parentMessageId: text('parent_message_id'),     // nullable, self-reference for threads
  senderId: text('sender_id').notNull(),
  senderName: text('sender_name').notNull(),
  senderType: text('sender_type', { enum: ['agent', 'human', 'system', 'hook'] }).notNull(),
  content: text('content').notNull(),
  messageType: text('message_type', { enum: ['text', 'event', 'hook'] }).notNull().default('text'),
  metadata: text('metadata').notNull().default('{}'),  // JSON stored as TEXT
  createdAt: text('created_at').notNull(),
}, (t) => [
  // Primary query index: tenant-scoped channel message lookups
  index('idx_messages_tenant_channel').on(t.tenantId, t.channelId, t.id),
  // Thread lookup index (indexes all rows including NULL — see note above)
  index('idx_messages_thread').on(t.parentMessageId),
]);

export const presence = sqliteTable('presence', {
  agentId: text('agent_id').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  channelId: text('channel_id').notNull().references(() => channels.id),
  status: text('status', { enum: ['active', 'idle'] }).notNull().default('active'),
  lastSeenAt: text('last_seen_at').notNull(),
}, (t) => [
  index('idx_presence_tenant').on(t.tenantId),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),                    // ULID
  channelId: text('channel_id').notNull().references(() => channels.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),  // denormalized
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  contentType: text('content_type', { enum: ['text', 'markdown', 'json'] }).notNull().default('text'),
  createdById: text('created_by_id').notNull(),
  createdByName: text('created_by_name').notNull(),
  createdByType: text('created_by_type', { enum: ['agent', 'human'] }).notNull().default('agent'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_documents_tenant_channel').on(t.tenantId, t.channelId),
]);

export const checkins = sqliteTable('checkins', {
  agentId: text('agent_id').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  lastCheckinAt: text('last_checkin_at').notNull(),
});

// Drizzle-inferred types — used by query layer and consumers
export type TenantRow = typeof tenants.$inferSelect;
export type TenantInsert = typeof tenants.$inferInsert;
export type ChannelRow = typeof channels.$inferSelect;
export type ChannelInsert = typeof channels.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type PresenceRow = typeof presence.$inferSelect;
export type PresenceInsert = typeof presence.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
export type CheckinRow = typeof checkins.$inferSelect;
export type CheckinInsert = typeof checkins.$inferInsert;
