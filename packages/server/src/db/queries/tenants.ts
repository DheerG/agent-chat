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
    archivedAt: row.archivedAt ?? null,
  };
}

interface TenantRawRow {
  id: string;
  name: string;
  codebase_path: string;
  created_at: string;
  archived_at: string | null;
}

function rawRowToTenant(row: TenantRawRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    codebasePath: row.codebase_path,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
  };
}

export function createTenantQueries(instance: DbInstance, queue: WriteQueue) {
  const { db, rawDb } = instance;

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
      return { id, name: data.name, codebasePath: data.codebasePath, createdAt, archivedAt: null };
    },

    getTenantById(id: string): Tenant | null {
      const row = db.select().from(tenants).where(eq(tenants.id, id)).get();
      return row ? rowToTenant(row) : null;
    },

    getTenantByCodebasePath(codebasePath: string): Tenant | null {
      const row = db.select().from(tenants).where(eq(tenants.codebasePath, codebasePath)).get();
      return row ? rowToTenant(row) : null;
    },

    listAll(): Tenant[] {
      const rows = rawDb.prepare(
        'SELECT id, name, codebase_path, created_at, archived_at FROM tenants WHERE archived_at IS NULL'
      ).all() as TenantRawRow[];
      return rows.map(rawRowToTenant);
    },

    listArchived(): Tenant[] {
      const rows = rawDb.prepare(
        'SELECT id, name, codebase_path, created_at, archived_at FROM tenants WHERE archived_at IS NOT NULL'
      ).all() as TenantRawRow[];
      return rows.map(rawRowToTenant);
    },

    async archiveTenant(id: string): Promise<boolean> {
      const now = new Date().toISOString();
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE tenants SET archived_at = ? WHERE id = ?'
        ).run(now, id)
      );
      return result.changes > 0;
    },

    async restoreTenant(id: string): Promise<boolean> {
      const result = await queue.enqueue(() =>
        rawDb.prepare(
          'UPDATE tenants SET archived_at = NULL WHERE id = ?'
        ).run(id)
      );
      return result.changes > 0;
    },
  };
}
