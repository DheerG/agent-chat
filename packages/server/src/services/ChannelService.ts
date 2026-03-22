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

  /** Find a channel by name within a tenant (includes archived channels) */
  findByName(tenantId: string, name: string): Channel | null {
    return this.q.getChannelByName(tenantId, name);
  }

  listArchivedByTenant(tenantId: string): Channel[] {
    return this.q.getArchivedChannelsByTenant(tenantId);
  }

  listActiveByTenant(tenantId: string): Channel[] {
    return this.q.getActiveChannelsByTenant(tenantId);
  }

  listByTenantWithStale(tenantId: string): Array<Channel & { stale: boolean }> {
    return this.q.getChannelsByTenantWithStale(tenantId);
  }

  /** Find session channels inactive 72h+ across all tenants (for auto-archive cleanup) */
  getStaleSessionChannelsForArchival(): Array<{ id: string; tenantId: string }> {
    return this.q.getStaleSessionChannelsForArchival();
  }

  async archive(tenantId: string, channelId: string, userInitiated: boolean = false): Promise<boolean> {
    return this.q.archiveChannel(tenantId, channelId, userInitiated);
  }

  async restore(tenantId: string, channelId: string): Promise<boolean> {
    return this.q.restoreChannel(tenantId, channelId);
  }
}
