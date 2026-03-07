---
phase: 07-channel-and-tenant-archiving
plan: 01
subsystem: server
tags: [sqlite, drizzle, hono, archiving, rest-api]

requires:
  - phase: 06-documents-and-canvases
    provides: Complete data layer, services, HTTP API
provides:
  - archivedAt column on tenants and channels tables
  - Idempotent ALTER TABLE migration for archived_at columns
  - Tenant and channel query layer with archive/restore operations
  - TenantService with cascading archive (tenant + all channels)
  - ChannelService with individual archive/restore
  - HTTP endpoints for archive, restore, and listing archived items
affects:
  - packages/server/src/db/queries/tenants.ts (listAll now filters archived)
  - packages/server/src/db/queries/channels.ts (getChannelsByTenant now filters archived)

tech-stack:
  added: []
  patterns: [raw SQL for IS NULL queries due to Drizzle ORM compatibility, idempotent ALTER TABLE migrations]

key-files:
  created: []
  modified:
    - packages/shared/src/schema.ts
    - packages/shared/src/types.ts
    - packages/server/src/db/index.ts
    - packages/server/src/db/queries/tenants.ts
    - packages/server/src/db/queries/channels.ts
    - packages/server/src/services/TenantService.ts
    - packages/server/src/services/ChannelService.ts
    - packages/server/src/services/index.ts
    - packages/server/src/http/routes/tenants.ts
    - packages/server/src/http/routes/channels.ts
    - packages/server/src/http/__tests__/tenants.test.ts
    - packages/server/src/http/__tests__/channels.test.ts

key-decisions:
  - "Used raw SQL (rawDb.prepare) for IS NULL/IS NOT NULL queries because Drizzle ORM 0.45.1 isNull/isNotNull helpers generated invalid SQL for this column"
  - "Used raw SQL for UPDATE SET archived_at operations for the same compatibility reason"
  - "TenantService constructor takes both TenantQueries and ChannelQueries to enable cascading archive/restore"
  - "Static /archived routes registered BEFORE parameterized /:id routes to prevent Hono from matching 'archived' as an ID"

patterns-established:
  - "Idempotent ALTER TABLE try-catch migration pattern for adding nullable columns to existing tables"
  - "Raw SQL for queries involving IS NULL on columns added via ALTER TABLE migration"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

duration: 15min
completed: 2026-03-07
---

# Plan 07-01: Backend Schema, Queries, Services, and HTTP API for Archive/Restore

**Full server-side archiving: schema migration, query layer, service layer with cascading behavior, and REST endpoints**

## Performance

- **Duration:** 15 min
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- archivedAt nullable column added to both tenants and channels Drizzle schema definitions
- Tenant and Channel TypeScript interfaces updated with archivedAt: string | null
- Idempotent ALTER TABLE migration runs at DB startup (try-catch pattern for SQLite)
- listAll() excludes archived tenants; listArchived() returns only archived
- getChannelsByTenant() excludes archived channels; getArchivedChannelsByTenant() returns only archived
- Individual channel archive/restore with double-archive/double-restore prevention
- Tenant archive cascades to all channels; tenant restore cascades to all channels
- 6 new HTTP endpoints: GET /archived, PATCH /:id/archive, PATCH /:id/restore for both tenants and channels
- 14 new HTTP tests covering archive, restore, cascade, regression, and edge cases
- 112 total server tests passing with zero regressions

## Files Modified
- `packages/shared/src/schema.ts` - Added archivedAt column to tenants and channels tables
- `packages/shared/src/types.ts` - Added archivedAt field to Tenant and Channel interfaces
- `packages/server/src/db/index.ts` - Added idempotent ALTER TABLE migrations for archived_at
- `packages/server/src/db/queries/tenants.ts` - Added listArchived, archiveTenant, restoreTenant; listAll filters archived
- `packages/server/src/db/queries/channels.ts` - Added getArchivedChannelsByTenant, archiveChannel, restoreChannel, archiveChannelsByTenant, restoreChannelsByTenant; getChannelsByTenant filters archived
- `packages/server/src/services/TenantService.ts` - Added archive (cascading), restore (cascading), listArchived; constructor takes ChannelQueries
- `packages/server/src/services/ChannelService.ts` - Added archive, restore, listArchivedByTenant
- `packages/server/src/services/index.ts` - Passes channelQ to TenantService constructor
- `packages/server/src/http/routes/tenants.ts` - Added GET /archived, PATCH /:tenantId/archive, PATCH /:tenantId/restore
- `packages/server/src/http/routes/channels.ts` - Added GET /archived, PATCH /:channelId/archive, PATCH /:channelId/restore
- `packages/server/src/http/__tests__/tenants.test.ts` - Added 7 archive/restore tests
- `packages/server/src/http/__tests__/channels.test.ts` - Added 7 archive/restore tests

## Issues Encountered
- Drizzle ORM 0.45.1 `isNull()` and `isNotNull()` helpers generated `near "is": syntax error` when used with the `archivedAt` column. Root cause: these helpers produce SQL like `"column" is null` but the column reference interpolation was incompatible with this Drizzle version. Resolution: used raw SQL queries (rawDb.prepare) for all IS NULL/IS NOT NULL operations.

## Deviations from Plan
- Used raw SQL (better-sqlite3 rawDb.prepare) instead of Drizzle ORM query builder for archive/restore queries and IS NULL filtering. The plan specified Drizzle ORM's isNull/isNotNull, but these generated invalid SQL with Drizzle 0.45.1.

---
*Phase: 07-channel-and-tenant-archiving*
*Completed: 2026-03-07*
