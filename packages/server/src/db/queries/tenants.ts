import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { tenants } from '@agent-chat/shared';
import type { Tenant, TenantRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    codebasePath: row.codebasePath,
    createdAt: row.createdAt,
  };
}

export function createTenantQueries(instance: DbInstance, queue: WriteQueue) {
  const { db } = instance;

  return {
    async insertTenant(data: { name: string; codebasePath: string }): Promise<Tenant> {
      const id = ulid();
      const createdAt = new Date().toISOString();
      await queue.enqueue(() =>
        db.insert(tenants).values({
          id,
          name: data.name,
          codebasePath: data.codebasePath,
          createdAt,
        }).run()
      );
      return { id, name: data.name, codebasePath: data.codebasePath, createdAt };
    },

    getTenantById(id: string): Tenant | null {
      const row = db.select().from(tenants).where(eq(tenants.id, id)).get();
      return row ? rowToTenant(row) : null;
    },

    getTenantByCodebasePath(codebasePath: string): Tenant | null {
      const row = db.select().from(tenants).where(eq(tenants.codebasePath, codebasePath)).get();
      return row ? rowToTenant(row) : null;
    },
  };
}
