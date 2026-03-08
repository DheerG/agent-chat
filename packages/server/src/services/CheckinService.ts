import type { createCheckinQueries } from '../db/queries/checkins.js';

type CheckinQueries = ReturnType<typeof createCheckinQueries>;

export class CheckinService {
  constructor(private q: CheckinQueries) {}

  async checkin(
    agentId: string,
    tenantId: string,
  ): Promise<{ checkedInAt: string; previousCheckin: string | null }> {
    return this.q.upsertCheckin(agentId, tenantId);
  }

  getLastCheckin(agentId: string, tenantId: string): string | null {
    const checkin = this.q.getCheckin(agentId, tenantId);
    return checkin?.lastCheckinAt ?? null;
  }
}
