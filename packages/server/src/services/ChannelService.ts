import type { Channel } from '@agent-chat/shared';
import type { createChannelQueries } from '../db/queries/channels.js';

type ChannelQueries = ReturnType<typeof createChannelQueries>;

export class ChannelService {
  constructor(private q: ChannelQueries) {}

  async create(
    tenantId: string,
    data: { name: string; sessionId?: string; type?: 'session' | 'manual' }
  ): Promise<Channel> {
    return this.q.insertChannel(tenantId, data);
  }

  listByTenant(tenantId: string): Channel[] {
    return this.q.getChannelsByTenant(tenantId);
  }

  getById(tenantId: string, channelId: string): Channel | null {
    return this.q.getChannelById(tenantId, channelId);
  }

  listArchivedByTenant(tenantId: string): Channel[] {
    return this.q.getArchivedChannelsByTenant(tenantId);
  }

  async archive(tenantId: string, channelId: string): Promise<boolean> {
    return this.q.archiveChannel(tenantId, channelId);
  }

  async restore(tenantId: string, channelId: string): Promise<boolean> {
    return this.q.restoreChannel(tenantId, channelId);
  }
}
