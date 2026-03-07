import type { Tenant } from '@agent-chat/shared';
import type { createTenantQueries } from '../db/queries/tenants.js';

type TenantQueries = ReturnType<typeof createTenantQueries>;

export class TenantService {
  constructor(private q: TenantQueries) {}

  async upsertByCodebasePath(name: string, codebasePath: string): Promise<Tenant> {
    const existing = this.q.getTenantByCodebasePath(codebasePath);
    if (existing) return existing;
    return this.q.insertTenant({ name, codebasePath });
  }

  getById(id: string): Tenant | null {
    return this.q.getTenantById(id);
  }

  listAll(): Tenant[] {
    return this.q.listAll();
  }
}
