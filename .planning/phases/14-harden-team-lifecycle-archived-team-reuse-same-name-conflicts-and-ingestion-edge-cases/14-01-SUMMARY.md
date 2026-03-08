# Plan 14-01 Summary: Fix Archived Team Reuse Bug

**Status:** Complete
**Duration:** ~5 minutes

## What Was Built

Fixed the archived team reuse bug where teams recreated after archiving had invisible messages. The root cause was `TenantService.upsertByCodebasePath()` returning archived tenants as-is without restoring them, causing `listByTenant` (which filters archived channels) to find no channels and create duplicates.

## Key Changes

1. **TenantService.upsertByCodebasePath auto-restore** — When an archived tenant matches the codebasePath, it's now automatically restored along with all its channels before being returned
2. **3 unit tests** for the auto-restore behavior in tenants.test.ts
3. **3 integration tests** for the full archived team reuse lifecycle in TeamInboxWatcher.test.ts

## Key Files

### Created
- None (all changes to existing files)

### Modified
- `packages/server/src/services/TenantService.ts` — Added auto-restore logic
- `packages/server/src/http/__tests__/tenants.test.ts` — Added 3 auto-restore unit tests
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — Added 3 integration tests

## Self-Check: PASSED

- [x] TypeScript compiles without errors
- [x] All 18 tenant tests pass (3 new)
- [x] All 35 TeamInboxWatcher tests pass (3 new)
- [x] Full server suite: 173 tests pass
- [x] Full client suite: 79 tests pass
- [x] Zero regressions

## Decisions Made

- Auto-restore is transparent to callers — no API changes needed
- Channels cascade-restore with the tenant (same behavior as manual UI restore)
- Return value always has `archivedAt: null` after restore
