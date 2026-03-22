# Phase 20, Plan 01: Auto-archive stale channels — Summary

**Status:** Complete
**Completed:** 2026-03-22

## Goal
Implement two auto-archive mechanisms: (1) periodic server-side cleanup that archives session channels inactive for 72+ hours, and (2) team channel archival when TeamInboxWatcher detects team directory deletion.

## What Was Built

### Auto-archive query
- Added `getStaleSessionChannelsForArchival()` to channel queries — finds all session-type channels across ALL tenants inactive for 72+ hours
- Handles both channels with old messages AND empty channels created 72h+ ago
- Excludes user-archived channels and already-archived channels

### AutoArchiveService
- New service with `start()`, `stop()`, and `runCleanup()` lifecycle methods
- Periodic timer: runs every hour via `setInterval`, first run 5 seconds after start
- System-initiated archives (`userInitiated=false`) so auto-restore works if channel is needed again
- Error handling per-channel (one failure doesn't stop the batch)
- Only logs when there's something to archive (no noise for empty cleanup runs)

### Team channel archival on deletion
- Updated `TeamInboxWatcher.removeTeam()` from sync to async
- Now archives the team's channel (system-initiated) before clearing internal state
- Channel can be auto-restored when team reappears (existing Phase 17 behavior preserved)

### Server lifecycle integration
- AutoArchiveService created and started in `index.ts` after services init
- Timer cleared first in SIGTERM shutdown sequence (before watcher, WS, HTTP)
- Exported from `services/index.ts` and `lib.ts` for external consumers

## Key Files

### Created
- `packages/server/src/services/AutoArchiveService.ts` — periodic cleanup service
- `packages/server/src/services/__tests__/AutoArchiveService.test.ts` — 9 tests

### Modified
- `packages/server/src/db/queries/channels.ts` — added `getStaleSessionChannelsForArchival` query
- `packages/server/src/services/ChannelService.ts` — exposed new query method
- `packages/server/src/services/index.ts` — export AutoArchiveService
- `packages/server/src/lib.ts` — export AutoArchiveService
- `packages/server/src/watcher/TeamInboxWatcher.ts` — async `removeTeam` with channel archive
- `packages/server/src/index.ts` — AutoArchiveService lifecycle integration
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — 2 new tests

## Test Results

- Server: 206 tests passed (18 files)
- Client: 91 tests passed (9 files)
- MCP: 48 tests passed (4 files)
- **Total: 345 tests, 0 failures, 0 regressions**

## Self-Check: PASSED

All must_haves verified:
- [x] Session channels inactive 72h+ are auto-archived by periodic cleanup
- [x] Session channels with no messages created 72h+ ago are auto-archived
- [x] User-archived channels are NOT touched by auto-archive
- [x] Manual/team channels are NOT auto-archived by periodic cleanup
- [x] Team channels are archived when team directory is deleted
- [x] Auto-archive uses userInitiated=false (auto-restorable)
- [x] Periodic cleanup runs every hour via setInterval
- [x] Timer cleared on graceful shutdown (SIGTERM)
- [x] All existing tests pass with zero regressions

## Deviations

None — implementation matches plan exactly.

---

*Phase: 20-auto-archive-stale-channels*
*Plan: 01*
*Completed: 2026-03-22*
