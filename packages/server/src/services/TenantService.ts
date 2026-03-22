import type { Tenant } from '@agent-chat/shared';
import type { createTenantQueries } from '../db/queries/tenants.js';
import type { createChannelQueries } from '../db/queries/channels.js';

type TenantQueries = ReturnType<typeof createTenantQueries>;
type ChannelQueries = ReturnType<typeof createChannelQueries>;

export class TenantService {
  constructor(private q: TenantQueries, private channelQ: ChannelQueries) {}

  async upsertByCodebasePath(name: string, codebasePath: string): Promise<Tenant> {
    const existing = this.q.getTenantByCodebasePath(codebasePath);
    if (existing) {
      // Auto-restore archived tenant only if NOT manually archived by user
      if (existing.archivedAt && !existing.userArchived) {
        await this.q.restoreTenant(existing.id);
        await this.channelQ.restoreChannelsByTenant(existing.id);
      }
      if (existing.name !== name) {
        await this.q.updateTenantName(existing.id, name);
        return { ...existing, name, archivedAt: null };
      }
      return { ...existing, archivedAt: null };
    }
    return this.q.insertTenant({ name, codebasePath });
  }

  getById(id: string): Tenant | null {
    return this.q.getTenantById(id);
  }

  listAll(): Tenant[] {
    return this.q.listAll();
  }

  listArchived(): Tenant[] {
    return this.q.listArchived();
  }

  async archive(id: string): Promise<boolean> {
    const success = await this.q.archiveTenant(id, true);
    if (success) {
      await this.channelQ.archiveChannelsByTenant(id, true);
    }
    return success;
  }

  async restore(id: string): Promise<boolean> {
    const success = await this.q.restoreTenant(id);
    if (success) {
      await this.channelQ.restoreChannelsByTenant(id);
    }
    return success;
  }
}
