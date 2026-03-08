import { eq, and, asc, lt, gt } from 'drizzle-orm';
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

interface MessageRawRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  parent_message_id: string | null;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  content: string;
  message_type: string;
  metadata: string;
  created_at: string;
}

function rawRowToMessage(row: MessageRawRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    tenantId: row.tenant_id,
    parentMessageId: row.parent_message_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderType: row.sender_type as Message['senderType'],
    content: row.content,
    messageType: row.message_type as Message['messageType'],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export function createMessageQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

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
      opts: PaginationOpts = {}
    ): Message[] {
      const limit = opts.limit ?? 50;
      const conditions = [
        eq(messages.tenantId, tenantId),
        eq(messages.channelId, channelId),
      ];

      // Cursor-based pagination: before/after are ULID strings (URL-safe, lexicographic)
      if (opts.before) conditions.push(lt(messages.id, opts.before));
      if (opts.after) conditions.push(gt(messages.id, opts.after));

      return db.select().from(messages)
        .where(and(...conditions))
        .orderBy(asc(messages.id))  // ULID lexicographic = chronological order
        .limit(limit)
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

    // Extended queries for Phase 13 — context persistence and recovery

    getMessagesSince(
      tenantId: string,
      channelId: string,
      since: string,
      limit: number = 200,
    ): Message[] {
      const rows = rawDb.prepare(`
        SELECT id, channel_id, tenant_id, parent_message_id, sender_id, sender_name,
               sender_type, content, message_type, metadata, created_at
        FROM messages
        WHERE tenant_id = ? AND channel_id = ? AND created_at > ?
        ORDER BY id ASC
        LIMIT ?
      `).all(tenantId, channelId, since, limit) as MessageRawRow[];
      return rows.map(rawRowToMessage);
    },

    getMessagesByTenantSince(
      tenantId: string,
      since: string,
      limit: number = 200,
    ): Message[] {
      const rows = rawDb.prepare(`
        SELECT id, channel_id, tenant_id, parent_message_id, sender_id, sender_name,
               sender_type, content, message_type, metadata, created_at
        FROM messages
        WHERE tenant_id = ? AND created_at > ?
        ORDER BY id ASC
        LIMIT ?
      `).all(tenantId, since, limit) as MessageRawRow[];
      return rows.map(rawRowToMessage);
    },

    getMessagesBySender(
      tenantId: string,
      senderId: string,
      opts: { since?: string; channelId?: string; limit?: number } = {},
    ): Message[] {
      const limit = opts.limit ?? 100;
      let sql = `
        SELECT id, channel_id, tenant_id, parent_message_id, sender_id, sender_name,
               sender_type, content, message_type, metadata, created_at
        FROM messages
        WHERE tenant_id = ? AND sender_id = ?
      `;
      const params: (string | number)[] = [tenantId, senderId];

      if (opts.channelId) {
        sql += ' AND channel_id = ?';
        params.push(opts.channelId);
      }
      if (opts.since) {
        sql += ' AND created_at > ?';
        params.push(opts.since);
      }
      sql += ' ORDER BY id ASC LIMIT ?';
      params.push(limit);

      const rows = rawDb.prepare(sql).all(...params) as MessageRawRow[];
      return rows.map(rawRowToMessage);
    },
  };
}
