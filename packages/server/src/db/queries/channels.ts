import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { channels } from '@agent-chat/shared';
import type { Channel, ChannelRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    sessionId: row.sessionId,
    type: row.type,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
    userArchived: row.userArchived === '1',
  };
}

interface ChannelRawRow {
  id: string;
  tenant_id: string;
  name: string;
  session_id: string | null;
  type: 'session' | 'manual';
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  user_archived: string | null;
}

function rawRowToChannel(row: ChannelRawRow): Channel {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sessionId: row.session_id,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    userArchived: row.user_archived === '1',
  };
}

export function createChannelQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

  return {
    // tenantId is the FIRST argument — TypeScript prevents omission
    async insertChannel(
      tenantId: string,
      data: { name: string; sessionId?: string; type?: 'session' | 'manual' }
    ): Promise<Channel> {
      const id = ulid();
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        db.insert(channels).values({
          id,
          tenantId,
          name: data.name,
          sessionId: data.sessionId ?? null,
          type: data.type ?? 'manual',
          createdAt: now,
          updatedAt: now,
        }).run()
      );
      return {
        id,
        tenantId,
        name: data.name,
        sessionId: data.sessionId ?? null,
        type: data.type ?? 'manual',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        userArchived: false,
      };
    },

    getChannelsByTenant(tenantId: string): Channel[] {
      const rows = rawDb.prepare(
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at, user_archived FROM channels WHERE tenant_id = ? AND archived_at IS NULL'
      ).all(tenantId) as ChannelRawRow[];
      return rows.map(rawRowToChannel);
    },

    getChannelById(tenantId: string, channelId: string): Channel | null {
      const row = db.select().from(channels)
        .where(and(eq(channels.tenantId, tenantId), eq(channels.id, channelId)))
        .get();
      return row ? rowToChannel(row) : null;
    },

    /** Find a channel by name within a tenant, including archived channels */
    getChannelByName(tenantId: string, name: string): Channel | null {
      const row = rawDb.prepare(
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at, user_archived FROM channels WHERE tenant_id = ? AND name = ? LIMIT 1'
      ).get(tenantId, name) as ChannelRawRow | undefined;
      return row ? rawRowToChannel(row) : null;
    },

    getArchivedChannelsByTenant(tenantId: string): Channel[] {
      const rows = rawDb.prepare(
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at, user_archived FROM channels WHERE tenant_id = ? AND archived_at IS NOT NULL'
      ).all(tenantId) as ChannelRawRow[];
      return rows.map(rawRowToChannel);
    },

    async archiveChannel(tenantId: string, channelId: string, userInitiated: boolean = false): Promise<boolean> {
      const now = new Date().toISOString();
      const userArchivedVal = userInitiated ? '1' : null;
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = ?, user_archived = ? WHERE id = ? AND tenant_id = ? AND archived_at IS NULL'
        ).run(now, userArchivedVal, channelId, tenantId)
      );
      return result.changes > 0;
    },

    async restoreChannel(tenantId: string, channelId: string): Promise<boolean> {
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = NULL, user_archived = NULL WHERE id = ? AND tenant_id = ? AND archived_at IS NOT NULL'
        ).run(channelId, tenantId)
      );
      return result.changes > 0;
    },

    async archiveChannelsByTenant(tenantId: string, userInitiated: boolean = false): Promise<void> {
      const now = new Date().toISOString();
      const userArchivedVal = userInitiated ? '1' : null;
      await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = ?, user_archived = ? WHERE tenant_id = ?'
        ).run(now, userArchivedVal, tenantId)
      );
    },

    async restoreChannelsByTenant(tenantId: string): Promise<void> {
      await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = NULL, user_archived = NULL WHERE tenant_id = ?'
        ).run(tenantId)
      );
    },

    /** Get non-stale, non-archived channels (hides stale channels: session=8h, manual/team=48h) */
    getActiveChannelsByTenant(tenantId: string): Channel[] {
      const rows = rawDb.prepare(
        `SELECT c.id, c.tenant_id, c.name, c.session_id, c.type, c.created_at, c.updated_at, c.archived_at, c.user_archived
         FROM channels c
         LEFT JOIN (
           SELECT channel_id, MAX(created_at) as last_activity
           FROM messages
           GROUP BY channel_id
         ) m ON c.id = m.channel_id
         WHERE c.tenant_id = ? AND c.archived_at IS NULL
           AND (m.last_activity IS NOT NULL AND m.last_activity >= CASE c.type
             WHEN 'session' THEN datetime('now', '-8 hours')
             ELSE datetime('now', '-48 hours')
           END)
         ORDER BY c.name`
      ).all(tenantId) as ChannelRawRow[];
      return rows.map(rawRowToChannel);
    },

    /** Find session channels inactive for 72+ hours across all tenants (for auto-archive) */
    getStaleSessionChannelsForArchival(): Array<{ id: string; tenantId: string }> {
      const rows = rawDb.prepare(
        `SELECT c.id, c.tenant_id
         FROM channels c
         LEFT JOIN (
           SELECT channel_id, MAX(created_at) as last_activity
           FROM messages
           GROUP BY channel_id
         ) m ON c.id = m.channel_id
         WHERE c.archived_at IS NULL
           AND (c.user_archived IS NULL OR c.user_archived != '1')
           AND c.type = 'session'
           AND (
             (m.last_activity IS NOT NULL AND m.last_activity < datetime('now', '-72 hours'))
             OR (m.last_activity IS NULL AND c.created_at < datetime('now', '-72 hours'))
           )`
      ).all() as Array<{ id: string; tenant_id: string }>;
      return rows.map(r => ({ id: r.id, tenantId: r.tenant_id }));
    },

    /** Get all non-archived channels with a stale indicator (session=8h, manual/team=48h) */
    getChannelsByTenantWithStale(tenantId: string): Array<Channel & { stale: boolean }> {
      interface ChannelWithStaleRow extends ChannelRawRow {
        is_stale: number;
      }
      const rows = rawDb.prepare(
        `SELECT c.id, c.tenant_id, c.name, c.session_id, c.type, c.created_at, c.updated_at, c.archived_at, c.user_archived,
           CASE
             WHEN m.last_activity IS NULL THEN 1
             WHEN c.type = 'session' AND m.last_activity < datetime('now', '-8 hours') THEN 1
             WHEN c.type != 'session' AND m.last_activity < datetime('now', '-48 hours') THEN 1
             ELSE 0
           END as is_stale
         FROM channels c
         LEFT JOIN (
           SELECT channel_id, MAX(created_at) as last_activity
           FROM messages
           GROUP BY channel_id
         ) m ON c.id = m.channel_id
         WHERE c.tenant_id = ? AND c.archived_at IS NULL
         ORDER BY c.name`
      ).all(tenantId) as ChannelWithStaleRow[];
      return rows.map(row => ({
        ...rawRowToChannel(row),
        stale: row.is_stale === 1,
      }));
    },
  };
}
