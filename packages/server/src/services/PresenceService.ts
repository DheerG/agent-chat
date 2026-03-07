import type { Presence } from '@agent-chat/shared';
import type { createPresenceQueries } from '../db/queries/presence.js';

type PresenceQueries = ReturnType<typeof createPresenceQueries>;

export class PresenceService {
  constructor(private q: PresenceQueries) {}

  async upsert(tenantId: string, data: {
    agentId: string;
    channelId: string;
    status: 'active' | 'idle';
  }): Promise<Presence> {
    return this.q.upsertPresence(tenantId, data);
  }

  getByChannel(tenantId: string, channelId: string): Presence[] {
    return this.q.getPresenceByChannel(tenantId, channelId);
  }

  getByAgent(tenantId: string, agentId: string): Presence | null {
    return this.q.getPresenceByAgent(tenantId, agentId);
  }
}
