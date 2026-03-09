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
      };
    },

    getChannelsByTenant(tenantId: string): Channel[] {
      const rows = rawDb.prepare(
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at FROM channels WHERE tenant_id = ? AND archived_at IS NULL'
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
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at FROM channels WHERE tenant_id = ? AND name = ? LIMIT 1'
      ).get(tenantId, name) as ChannelRawRow | undefined;
      return row ? rawRowToChannel(row) : null;
    },

    getArchivedChannelsByTenant(tenantId: string): Channel[] {
      const rows = rawDb.prepare(
        'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at FROM channels WHERE tenant_id = ? AND archived_at IS NOT NULL'
      ).all(tenantId) as ChannelRawRow[];
      return rows.map(rawRowToChannel);
    },

    async archiveChannel(tenantId: string, channelId: string): Promise<boolean> {
      const now = new Date().toISOString();
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = ? WHERE id = ? AND tenant_id = ? AND archived_at IS NULL'
        ).run(now, channelId, tenantId)
      );
      return result.changes > 0;
    },

    async restoreChannel(tenantId: string, channelId: string): Promise<boolean> {
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = NULL WHERE id = ? AND tenant_id = ? AND archived_at IS NOT NULL'
        ).run(channelId, tenantId)
      );
      return result.changes > 0;
    },

    async archiveChannelsByTenant(tenantId: string): Promise<void> {
      const now = new Date().toISOString();
      await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = ? WHERE tenant_id = ?'
        ).run(now, tenantId)
      );
    },

    async restoreChannelsByTenant(tenantId: string): Promise<void> {
      await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE channels SET archived_at = NULL WHERE tenant_id = ?'
        ).run(tenantId)
      );
    },
  };
}
