import type { DbInstance } from '../index.js';
import type { Checkin } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

export function createCheckinQueries(instance: DbInstance, queue: WriteQueue) {
  const { rawDb } = instance;

  // Prepared statement for upsert — SQLite INSERT ... ON CONFLICT DO UPDATE
  const upsertStmt = rawDb.prepare(`
    INSERT INTO checkins (agent_id, tenant_id, last_checkin_at)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_id, tenant_id)
    DO UPDATE SET last_checkin_at = excluded.last_checkin_at
  `);

  const getStmt = rawDb.prepare(`
    SELECT agent_id, tenant_id, last_checkin_at
    FROM checkins
    WHERE agent_id = ? AND tenant_id = ?
  `);

  return {
    async upsertCheckin(
      agentId: string,
      tenantId: string,
    ): Promise<{ checkedInAt: string; previousCheckin: string | null }> {
      // Get previous value first
      const existing = rawDb.prepare(
        'SELECT last_checkin_at FROM checkins WHERE agent_id = ? AND tenant_id = ?'
      ).get(agentId, tenantId) as { last_checkin_at: string } | undefined;

      const previousCheckin = existing?.last_checkin_at ?? null;
      const checkedInAt = new Date().toISOString();

      await queue.enqueue(() =>
        upsertStmt.run(agentId, tenantId, checkedInAt)
      );

      return { checkedInAt, previousCheckin };
    },

    getCheckin(agentId: string, tenantId: string): Checkin | null {
      const row = getStmt.get(agentId, tenantId) as {
        agent_id: string;
        tenant_id: string;
        last_checkin_at: string;
      } | undefined;

      if (!row) return null;

      return {
        agentId: row.agent_id,
        tenantId: row.tenant_id,
        lastCheckinAt: row.last_checkin_at,
      };
    },
  };
}
