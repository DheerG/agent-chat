import { eq, and } from 'drizzle-orm';
import type { DbInstance } from '../index.js';
import { presence } from '@agent-chat/shared';
import type { Presence, PresenceRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToPresence(row: PresenceRow): Presence {
  return {
    agentId: row.agentId,
    tenantId: row.tenantId,
    channelId: row.channelId,
    status: row.status,
    lastSeenAt: row.lastSeenAt,
  };
}

export function createPresenceQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

  // Prepared statement for upsert — SQLite INSERT ... ON CONFLICT DO UPDATE
  const upsertStmt = rawDb.prepare(`
    INSERT INTO presence (agent_id, tenant_id, channel_id, status, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, tenant_id, channel_id)
    DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at
  `);

  return {
    async upsertPresence(
      tenantId: string,
      data: {
        agentId: string;
        channelId: string;
        status: 'active' | 'idle';
      }
    ): Promise<Presence> {
      const lastSeenAt = new Date().toISOString();

      await queue.enqueue(() =>
        upsertStmt.run(data.agentId, tenantId, data.channelId, data.status, lastSeenAt)
      );

      return {
        agentId: data.agentId,
        tenantId,
        channelId: data.channelId,
        status: data.status,
        lastSeenAt,
      };
    },

    getPresenceByChannel(tenantId: string, channelId: string): Presence[] {
      return db.select().from(presence)
        .where(and(eq(presence.tenantId, tenantId), eq(presence.channelId, channelId)))
        .all()
        .map(rowToPresence);
    },

    getPresenceByAgent(tenantId: string, agentId: string): Presence | null {
      const row = db.select().from(presence)
        .where(and(eq(presence.tenantId, tenantId), eq(presence.agentId, agentId)))
        .get();
      return row ? rowToPresence(row) : null;
    },
  };
}
