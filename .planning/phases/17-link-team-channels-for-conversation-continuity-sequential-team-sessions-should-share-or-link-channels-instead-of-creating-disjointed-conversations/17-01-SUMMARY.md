# Plan 17-01 Summary: Channel Reuse for Sequential Team Sessions

**Status:** Complete
**Duration:** Single session
**Date:** 2026-03-09

## What Was Built

Fixed conversation continuity for sequential team sessions by modifying channel lookup to find and reuse existing channels (including archived ones) instead of creating new channels when a team restarts.

## Changes

### packages/server/src/db/queries/channels.ts
- Added `getChannelByName(tenantId, name)` query that finds a channel by name regardless of archive status (no `archived_at IS NULL` filter)

### packages/server/src/services/ChannelService.ts
- Added `findByName(tenantId, name)` method that delegates to the new query

### packages/server/src/watcher/TeamInboxWatcher.ts
- Replaced `listByTenant().find()` pattern with `findByName()` in `processTeam()`
- Added auto-restore logic: if found channel is archived, calls `restore()` before reuse
- Falls back to creating a new channel only when no channel with that name exists

### packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts
- Added 5 new tests in "Channel reuse for sequential team sessions" describe block:
  1. Reuses existing channel when team restarts (no archive)
  2. Restores and reuses archived channel when team restarts
  3. Messages from sequential sessions appear in same channel
  4. Restores archived channel and continues conversation
  5. Does not create duplicate channels across multiple restarts

## Test Results

- Server: 183 tests pass (45 in TeamInboxWatcher alone, 5 new)
- Client: 87 tests pass
- MCP: 48 tests pass
- Total: 318 tests, 0 failures, 0 regressions

## Key Decisions

- Used raw SQL for `getChannelByName` (consistent with existing IS NULL/IS NOT NULL pattern from Phase 7)
- `findByName` intentionally includes archived channels -- this is the core fix
- Auto-restore pattern mirrors `TenantService.upsertByCodebasePath` from Phase 14

## Self-Check: PASSED

- [x] `getChannelByName` finds channels regardless of archive status
- [x] `findByName` delegates correctly
- [x] `processTeam` reuses existing channels
- [x] Archived channels are auto-restored on reuse
- [x] No duplicate channels across restarts
- [x] All existing tests pass (zero regressions)
