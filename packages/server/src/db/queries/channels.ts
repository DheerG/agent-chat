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
  };
}

export function createChannelQueries(instance: DbInstance, queue: WriteQueue) {
  const { db } = instance;

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
      };
    },

    getChannelsByTenant(tenantId: string): Channel[] {
      return db.select().from(channels)
        .where(eq(channels.tenantId, tenantId))
        .all()
        .map(rowToChannel);
    },

    getChannelById(tenantId: string, channelId: string): Channel | null {
      const row = db.select().from(channels)
        .where(and(eq(channels.tenantId, tenantId), eq(channels.id, channelId)))
        .get();
      return row ? rowToChannel(row) : null;
    },
  };
}
