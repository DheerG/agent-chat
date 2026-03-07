# Phase 7: Channel and Tenant Archiving - Research

**Researched:** 2026-03-07
**Domain:** Soft-delete / archive pattern across full stack (SQLite + Hono API + React SPA)
**Confidence:** HIGH

## Summary

This phase adds soft-delete archiving for channels and tenants. The existing codebase has a clean, consistent architecture: Drizzle ORM schema in `@agent-chat/shared`, query functions in `packages/server/src/db/queries/`, service classes in `packages/server/src/services/`, Hono routes in `packages/server/src/http/routes/`, and React hooks + components in `packages/client/src/`. The archive feature touches every layer but follows well-established patterns already in place.

The core approach is adding an `archivedAt` nullable TEXT column to both the `tenants` and `channels` tables. This is preferable to a boolean `isArchived` because it preserves WHEN something was archived (useful for sorting in the archived view) and a NULL value naturally represents "not archived" which composes cleanly with existing queries via a simple `IS NULL` filter. The existing `listAll()` and `getChannelsByTenant()` queries need to be updated to filter out archived items by default, with new query variants that return only archived items for the archived view.

**Primary recommendation:** Add `archivedAt TEXT` (nullable, ISO 8601) to both `tenants` and `channels` tables. Filter archived items from existing list endpoints by default. Add PATCH endpoints for archive/restore. Keep UI changes minimal: archive buttons on sidebar items, a dedicated "Archived" section at the bottom of the sidebar.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Archiving a channel removes it from the active sidebar channel list
- Archiving a tenant archives all its channels and removes the tenant from the sidebar
- Archived items are soft-deleted (not permanently removed) -- data is preserved
- Archived channels/tenants can be restored back to active state
- Archive action available from the sidebar (context menu or button on channels/tenants)
- Dedicated "Archived" view/section to browse archived channels and tenants
- Restore action available from the archived view
- Keep it simple -- no confirmation dialogs beyond a single click

### Claude's Discretion
- Whether to add an `archivedAt` column vs a boolean `isArchived` flag
- API endpoint design for archive/restore operations
- Exact UI placement of archive controls (inline button, context menu, etc.)
- Whether archived view is a separate page or a sidebar section

### Deferred Ideas (OUT OF SCOPE)
- Permanent deletion of archived items
- Bulk archive operations
- Auto-archive after inactivity period
</user_constraints>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.0 | ORM for SQLite schema + queries | Already used; schema changes via raw DDL in `db/index.ts` |
| better-sqlite3 | ^12.6.0 | SQLite driver | Already used; synchronous reads, async writes via WriteQueue |
| hono | ^4.12.5 | HTTP framework | Already used; PATCH routes follow existing POST/GET patterns |
| react | ^18.3.1 | UI framework | Already used; hooks + components pattern |
| zod | ^4.3.6 | Request validation | Already used in all route handlers |
| vitest | ^3.2.1 | Test framework | Already used across all packages |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | ^16.3.0 | Component testing | Sidebar and archived view tests |
| ulid | ^2.3.0 | ID generation | Not needed for archive (no new entities) |

### No New Dependencies Required
This feature is entirely achievable with the existing stack. No new libraries are needed.

## Architecture Patterns

### Recommended Changes by Layer

```
packages/shared/src/
  schema.ts          # Add archivedAt to tenants + channels tables
  types.ts           # Add archivedAt to Tenant + Channel interfaces

packages/server/src/
  db/
    index.ts         # Add ALTER TABLE migration DDL for archivedAt columns
    queries/
      tenants.ts     # Add archiveTenant, restoreTenant, listArchived queries
      channels.ts    # Add archiveChannel, restoreChannel, listArchived, archiveByTenant queries
  services/
    TenantService.ts # Add archive, restore, listArchived methods
    ChannelService.ts# Add archive, restore, listArchived methods
  http/routes/
    tenants.ts       # Add PATCH /:tenantId/archive, PATCH /:tenantId/restore, GET /archived
    channels.ts      # Add PATCH /:channelId/archive, PATCH /:channelId/restore, GET /archived

packages/client/src/
  lib/api.ts         # Add archiveChannel, restoreChannel, archiveTenant, restoreTenant, fetchArchived*
  hooks/
    useTenants.ts    # Refetch/filter after archive
    useChannels.ts   # Refetch/filter after archive
  components/
    Sidebar.tsx      # Add archive buttons, archived section toggle
    Sidebar.css      # Styles for archive button, archived section
```

### Pattern 1: Soft-Delete via Nullable Timestamp Column

**What:** Add `archivedAt TEXT` (nullable, ISO 8601) to tables. NULL = active, non-NULL = archived.
**When to use:** Always -- this is the standard soft-delete pattern.
**Why `archivedAt` over `isArchived` boolean:**
- Provides temporal information (when was it archived, sort archived items by archive date)
- NULL/non-NULL naturally maps to active/archived partitioning
- Consistent with existing `createdAt`/`updatedAt` column style
- No information loss vs boolean

**Schema change (Drizzle):**
```typescript
// In schema.ts - tenants table
archivedAt: text('archived_at'),  // nullable -- NULL means active

// In schema.ts - channels table
archivedAt: text('archived_at'),  // nullable -- NULL means active
```

**Type change:**
```typescript
// In types.ts
export interface Tenant {
  // ... existing fields
  archivedAt: string | null;  // ISO 8601 or null
}

export interface Channel {
  // ... existing fields
  archivedAt: string | null;  // ISO 8601 or null
}
```

### Pattern 2: Migration via ALTER TABLE in DDL Block

**What:** The project uses raw SQL DDL in `db/index.ts` (`CREATE_TABLES_SQL` constant) applied at startup with `CREATE TABLE IF NOT EXISTS`. For adding columns to existing tables, use `ALTER TABLE ... ADD COLUMN` with existence checks.
**Why:** The project does NOT use drizzle-kit migrations. Schema changes are applied at startup.

**Migration approach:**
```sql
-- SQLite ALTER TABLE ADD COLUMN is safe -- it's a no-op if column already exists (via try/catch)
-- But SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- Use a pragma-based check or try/catch in JS
```

Since SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, the safest approach is to wrap each `ALTER TABLE` in a try-catch in JavaScript:

```typescript
// In db/index.ts, after CREATE_TABLES_SQL exec
try {
  rawDb.exec('ALTER TABLE tenants ADD COLUMN archived_at TEXT');
} catch {
  // Column already exists -- ignore
}
try {
  rawDb.exec('ALTER TABLE channels ADD COLUMN archived_at TEXT');
} catch {
  // Column already exists -- ignore
}
```

This is idempotent: runs on every startup, silently succeeds if columns exist.

### Pattern 3: Filtering Archived Items from Default Queries

**What:** Existing `listAll()` and `getChannelsByTenant()` queries must filter out archived items by default. New `listArchived*()` methods return only archived items.
**Why:** Active views should never show archived items. Archived view should only show archived items.

```typescript
// Modified existing query - filter out archived
listAll(): Tenant[] {
  return db.select().from(tenants)
    .where(isNull(tenants.archivedAt))
    .all()
    .map(rowToTenant);
}

// New query - archived only
listArchived(): Tenant[] {
  return db.select().from(tenants)
    .where(isNotNull(tenants.archivedAt))
    .all()
    .map(rowToTenant);
}
```

### Pattern 4: Cascading Archive for Tenants

**What:** When a tenant is archived, all its channels are also archived. When restored, all its channels are restored.
**Why:** User decision: "Archiving a tenant archives all its channels."

```typescript
// In tenant queries
async archiveTenant(id: string): Promise<void> {
  const now = new Date().toISOString();
  await queue.enqueue(() => {
    db.update(tenants).set({ archivedAt: now }).where(eq(tenants.id, id)).run();
    db.update(channels).set({ archivedAt: now }).where(eq(channels.tenantId, id)).run();
  });
}

async restoreTenant(id: string): Promise<void> {
  await queue.enqueue(() => {
    db.update(tenants).set({ archivedAt: null }).where(eq(tenants.id, id)).run();
    db.update(channels).set({ archivedAt: null }).where(eq(channels.tenantId, id)).run();
  });
}
```

**Important edge case:** If a channel was individually archived before its tenant was archived, restoring the tenant will also restore that channel. This is acceptable for simplicity (user decision: keep it simple).

### Pattern 5: PATCH Endpoints for Archive/Restore

**What:** Use PATCH verb for archive and restore operations since they modify an existing resource's state.
**Why:** Consistent RESTful semantics. PATCH = partial update. Archive/restore is toggling a field.

**API Design:**
```
PATCH /api/tenants/:tenantId/archive     -> archives tenant + all channels
PATCH /api/tenants/:tenantId/restore     -> restores tenant + all channels
GET   /api/tenants/archived              -> lists archived tenants

PATCH /api/tenants/:tenantId/channels/:channelId/archive   -> archives single channel
PATCH /api/tenants/:tenantId/channels/:channelId/restore   -> restores single channel
GET   /api/tenants/:tenantId/channels/archived             -> lists archived channels for tenant
```

**Alternative considered:** `POST /api/tenants/:tenantId/archive` would also work, but PATCH is more semantically correct for a state change on an existing resource. The project already uses POST for creation only.

### Pattern 6: Sidebar Archived Section

**What:** Add an "Archived" collapsible section at the bottom of the sidebar that shows archived tenants and channels. Restore buttons inside this section.
**Why:** Keeps archived items accessible but out of the way (user goal: "clean up clutter"). A separate page would be overengineered for this simple feature.

**UI Layout:**
```
Sidebar
  [AgentChat header]
  [Active Tenants]
    Tenant A
      #channel-1  [archive-btn]
      #channel-2  [archive-btn]
    Tenant B [archive-btn]
      #channel-3  [archive-btn]
  [Archived section - collapsible, collapsed by default]
    Archived Tenant C [restore-btn]
      #channel-4  [restore-btn]
    Archived channels from active tenants:
      #channel-5  [restore-btn]
```

**Archive button placement:** Small icon button (e.g., box/archive icon) that appears on hover over channel/tenant items. This avoids cluttering the sidebar while keeping the action one-click accessible (user decision: no confirmation dialogs beyond a single click).

### Anti-Patterns to Avoid
- **Separate archive tables:** Do NOT create `archived_tenants`/`archived_channels` tables. This duplicates schema and complicates foreign key relationships. A nullable column is simpler and standard.
- **DELETE + re-INSERT for archive/restore:** Loses created_at timestamps, message references, and other data. Soft-delete preserves everything.
- **WebSocket events for archive operations:** Unlike messages and documents, archive operations don't need real-time push. The user performing the archive sees the effect immediately. Other clients can refresh on next load. This avoids unnecessary complexity.
- **Filtering in the client:** Always filter at the database query level, not in React. The client should never receive archived items when requesting active items.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migration system | Custom versioned migration runner | Try/catch ALTER TABLE at startup | Project already uses this pattern; SQLite ADD COLUMN is safe |
| Soft-delete framework | Generic soft-delete wrapper | Direct archivedAt column + query filters | Only 2 tables need it; abstraction not justified |
| Confirmation dialog | Custom modal component | Single click (user decision) | User explicitly chose no confirmation dialogs |

**Key insight:** This feature is straightforward CRUD. The entire implementation is column additions, query modifications, new endpoints, and UI updates. No novel patterns or complex libraries are needed.

## Common Pitfalls

### Pitfall 1: Breaking Existing Channel/Tenant List Queries
**What goes wrong:** After adding `archivedAt`, existing `listAll()` and `getChannelsByTenant()` return archived items alongside active ones, breaking the sidebar.
**Why it happens:** Forgetting to add `WHERE archived_at IS NULL` to existing queries.
**How to avoid:** Update ALL existing list queries to filter by `isNull(archivedAt)` as the FIRST change. Test by creating an archived item and verifying it does NOT appear in the existing list endpoint.
**Warning signs:** Sidebar shows archived items after archiving and refreshing.

### Pitfall 2: Orphaned Archived Channels After Tenant Restore
**What goes wrong:** Restoring a tenant but forgetting to also restore its channels, leaving them archived and invisible.
**Why it happens:** The restore operation only updates the tenant row, not its channels.
**How to avoid:** Always restore channels in the same write transaction as the tenant restore. The WriteQueue's `enqueue` already provides a synchronous execution context -- run both updates inside one enqueue call.
**Warning signs:** Tenant appears in sidebar after restore but shows "No channels".

### Pitfall 3: Hono Route Ordering for `/archived` vs `/:tenantId`
**What goes wrong:** `GET /api/tenants/archived` matches the `/:tenantId` route instead, treating "archived" as a tenant ID and returning 404.
**Why it happens:** Hono matches routes in order. If `/:tenantId` is defined before `/archived`, the parameterized route wins.
**How to avoid:** Define the `/archived` static route BEFORE the `/:tenantId` parameterized route.
**Warning signs:** GET `/api/tenants/archived` returns `{ error: 'Tenant not found' }`.

### Pitfall 4: SQLite ALTER TABLE Limitations
**What goes wrong:** Attempting to use `IF NOT EXISTS` with `ALTER TABLE ADD COLUMN` causes a syntax error.
**Why it happens:** SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (unlike PostgreSQL).
**How to avoid:** Wrap each `ALTER TABLE` in a JavaScript try-catch block. The error for duplicate column names is predictable and safe to swallow.
**Warning signs:** App crashes on startup after the column already exists.

### Pitfall 5: Archived Tenant's Channels Still Individually Accessible
**What goes wrong:** After archiving a tenant, its channels are still accessible via `GET /api/tenants/:tenantId/channels/:channelId` because the getById query doesn't check archivedAt.
**Why it happens:** Only the list query was updated, not the getById query.
**How to avoid:** Decide on the semantics: should archived channels be accessible by direct ID? For this feature, YES -- the archived view needs to fetch them. But the list endpoints for active channels must filter them out. The `getById` query can remain unchanged (it's used for WS subscriptions and message fetching on already-selected channels).

### Pitfall 6: rowToTenant/rowToChannel Missing archivedAt Field
**What goes wrong:** TypeScript types include `archivedAt` but the row-to-domain mapping functions don't include it, silently dropping the field.
**Why it happens:** The mapper functions explicitly list fields rather than spreading.
**How to avoid:** Add `archivedAt: row.archivedAt ?? null` to both `rowToTenant()` and `rowToChannel()` mapper functions.

## Code Examples

### Schema Change (shared/src/schema.ts)
```typescript
// Source: existing project pattern
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  codebasePath: text('codebase_path').notNull(),
  createdAt: text('created_at').notNull(),
  archivedAt: text('archived_at'),  // NEW: nullable = active, ISO 8601 = archived
}, (t) => [
  uniqueIndex('idx_tenants_codebase_path').on(t.codebasePath),
]);

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  sessionId: text('session_id'),
  type: text('type', { enum: ['session', 'manual'] }).notNull().default('manual'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),  // NEW: nullable = active
}, (t) => [
  index('idx_channels_tenant').on(t.tenantId),
]);
```

### Migration DDL (server/src/db/index.ts)
```typescript
// After rawDb.exec(CREATE_TABLES_SQL), add:
// Idempotent column additions for archive feature
try { rawDb.exec('ALTER TABLE tenants ADD COLUMN archived_at TEXT'); } catch { /* column exists */ }
try { rawDb.exec('ALTER TABLE channels ADD COLUMN archived_at TEXT'); } catch { /* column exists */ }
```

### Archive Query (server/src/db/queries/channels.ts)
```typescript
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

// Modified existing query: filter out archived
getChannelsByTenant(tenantId: string): Channel[] {
  return db.select().from(channels)
    .where(and(eq(channels.tenantId, tenantId), isNull(channels.archivedAt)))
    .all()
    .map(rowToChannel);
},

// New query: archive a channel
async archiveChannel(tenantId: string, channelId: string): Promise<boolean> {
  const now = new Date().toISOString();
  let updated = false;
  await queue.enqueue(() => {
    const result = db.update(channels)
      .set({ archivedAt: now })
      .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId), isNull(channels.archivedAt)))
      .run();
    updated = result.changes > 0;
  });
  return updated;
},

// New query: restore a channel
async restoreChannel(tenantId: string, channelId: string): Promise<boolean> {
  let updated = false;
  await queue.enqueue(() => {
    const result = db.update(channels)
      .set({ archivedAt: null })
      .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId), isNotNull(channels.archivedAt)))
      .run();
    updated = result.changes > 0;
  });
  return updated;
},

// New query: list archived channels for a tenant
getArchivedChannelsByTenant(tenantId: string): Channel[] {
  return db.select().from(channels)
    .where(and(eq(channels.tenantId, tenantId), isNotNull(channels.archivedAt)))
    .all()
    .map(rowToChannel);
},
```

### API Route (server/src/http/routes/channels.ts)
```typescript
// PATCH /api/tenants/:tenantId/channels/:channelId/archive
router.patch('/:channelId/archive', async (c) => {
  const tenantId = c.req.param('tenantId') as string;
  const channelId = c.req.param('channelId') as string;
  if (!services.tenants.getById(tenantId)) {
    return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
  }
  const success = await services.channels.archive(tenantId, channelId);
  if (!success) return c.json({ error: 'Channel not found or already archived', code: 'NOT_FOUND' }, 404);
  return c.json({ success: true });
});
```

### Client API (client/src/lib/api.ts)
```typescript
export async function archiveChannel(tenantId: string, channelId: string): Promise<void> {
  await fetchJson(`${BASE_URL}/tenants/${tenantId}/channels/${channelId}/archive`, {
    method: 'PATCH',
  });
}

export async function restoreChannel(tenantId: string, channelId: string): Promise<void> {
  await fetchJson(`${BASE_URL}/tenants/${tenantId}/channels/${channelId}/restore`, {
    method: 'PATCH',
  });
}

export async function fetchArchivedTenants(): Promise<Tenant[]> {
  const data = await fetchJson<{ tenants: Tenant[] }>(`${BASE_URL}/tenants/archived`);
  return data.tenants;
}

export async function fetchArchivedChannels(tenantId: string): Promise<Channel[]> {
  const data = await fetchJson<{ channels: Channel[] }>(`${BASE_URL}/tenants/${tenantId}/channels/archived`);
  return data.channels;
}
```

### Sidebar Archive Button Pattern
```typescript
// Hover-reveal archive button on channel items
<button
  className={`channel-item ${selectedChannelId === channel.id ? 'channel-item--active' : ''}`}
  onClick={() => onChannelSelect(tenant.id, channel.id)}
>
  <span className="channel-hash">#</span>
  <span className="channel-name">{channel.name}</span>
  <button
    className="channel-archive-btn"
    onClick={(e) => {
      e.stopPropagation();  // Prevent channel selection
      onArchiveChannel(tenant.id, channel.id);
    }}
    title="Archive channel"
  >
    {/* Box/archive icon character or SVG */}
  </button>
</button>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `is_deleted BOOLEAN` | `archived_at TIMESTAMP` (nullable) | Industry standard since ~2015 | Preserves temporal info, cleaner query semantics |
| Separate archive table | Column on same table | N/A | Avoids schema duplication, FK complexity |

**No deprecated/outdated concerns:** All project dependencies are current. Drizzle ORM's `isNull`/`isNotNull` operators are stable and well-supported.

## Open Questions

1. **Should archiving the currently-viewed channel redirect the user?**
   - What we know: If a user archives the channel they're currently viewing, the sidebar will remove it but the main content area will still show the channel's messages.
   - What's unclear: Should the UI auto-deselect the channel, or let the user continue viewing it?
   - Recommendation: Auto-deselect and show the "Select a channel to start" placeholder. This is the simplest behavior and avoids confusion. The channel is gone from the sidebar, so the user has no way to re-select it without going to Archived.

2. **Should individually-archived channels appear under an archived tenant in the Archived section?**
   - What we know: If Channel A was individually archived, then its Tenant B was also archived, Channel A is doubly-archived.
   - What's unclear: When showing archived Tenant B in the Archived view, should Channel A appear alongside the other channels?
   - Recommendation: Yes, show all archived channels under the archived tenant. On restore of the tenant, all channels (including previously-individually-archived ones) are restored. This is the simplest behavior.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.1 |
| Config file | Per-package vitest config (server uses vitest in package.json scripts) |
| Quick run command | `cd packages/server && npx vitest run --reporter=verbose` |
| Full suite command | `cd packages/server && npx vitest run && cd ../client && npx vitest run && cd ../mcp && npx vitest run` |

### Phase Requirements --> Test Map

Since this phase has no specific requirement IDs, tests map to the success criteria:

| Success Criteria | Behavior | Test Type | Automated Command | File Exists? |
|-----------------|----------|-----------|-------------------|-------------|
| SC-1: Archive channel from sidebar | PATCH archive endpoint sets archivedAt, channel disappears from list | unit (HTTP) | `cd packages/server && npx vitest run src/http/__tests__/channels.test.ts -x` | Exists (extend) |
| SC-1: Archive channel from sidebar | Sidebar re-renders without archived channel | unit (component) | `cd packages/client && npx vitest run src/__tests__/Sidebar.test.tsx -x` | Exists (extend) |
| SC-2: Archive tenant cascades | PATCH tenant archive sets archivedAt on tenant + all channels | unit (HTTP) | `cd packages/server && npx vitest run src/http/__tests__/tenants.test.ts -x` | Exists (extend) |
| SC-3: Archived view lists items | GET /archived endpoints return only archived items | unit (HTTP) | `cd packages/server && npx vitest run src/http/__tests__/tenants.test.ts -x` | Exists (extend) |
| SC-4: Restore archived items | PATCH restore endpoint clears archivedAt, items reappear in active list | unit (HTTP) | `cd packages/server && npx vitest run src/http/__tests__/channels.test.ts -x` | Exists (extend) |
| Schema migration | ALTER TABLE ADD COLUMN is idempotent | unit (DB) | `cd packages/server && npx vitest run src/db/__tests__/schema.test.ts -x` | Exists (extend) |
| Tenant-channel cascade | Archiving tenant archives all channels; restoring restores all | unit (service/query) | `cd packages/server && npx vitest run src/db/__tests__/channels.test.ts -x` | File exists but may need new test file |

### Sampling Rate
- **Per task commit:** `cd packages/server && npx vitest run && cd ../client && npx vitest run`
- **Per wave merge:** Full suite including MCP: `cd packages/server && npx vitest run && cd ../client && npx vitest run && cd ../mcp && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- None -- existing test infrastructure covers all phase requirements. Tests will be added to existing test files (channels.test.ts, tenants.test.ts, Sidebar.test.tsx).

## Sources

### Primary (HIGH confidence)
- Project source code: `packages/shared/src/schema.ts`, `packages/shared/src/types.ts` -- current schema and types
- Project source code: `packages/server/src/db/index.ts` -- DDL migration pattern (raw SQL at startup)
- Project source code: `packages/server/src/db/queries/channels.ts`, `tenants.ts` -- query patterns
- Project source code: `packages/server/src/services/` -- service layer patterns
- Project source code: `packages/server/src/http/routes/` -- Hono route patterns
- Project source code: `packages/client/src/components/Sidebar.tsx` -- current sidebar implementation
- Project source code: `packages/client/src/lib/api.ts` -- client API patterns
- Project source code: `packages/client/src/hooks/` -- React hook patterns

### Secondary (MEDIUM confidence)
- Drizzle ORM docs: `isNull`/`isNotNull` operators are standard Drizzle query building functions (verified in existing codebase usage of `eq`, `and`)
- SQLite docs: `ALTER TABLE ADD COLUMN` behavior -- adds column, errors on duplicate (well-known SQLite behavior)

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns already in codebase
- Architecture: HIGH - straightforward extension of existing patterns across all layers
- Pitfalls: HIGH - identified from direct analysis of Hono route ordering, SQLite limitations, and query/mapper patterns

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- no external dependencies or fast-moving APIs involved)
