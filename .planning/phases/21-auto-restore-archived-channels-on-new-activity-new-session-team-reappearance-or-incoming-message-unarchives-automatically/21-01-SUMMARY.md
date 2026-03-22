# Phase 21 Plan 01 — Execution Summary

**Completed:** 2026-03-22
**Duration:** Single session
**Status:** All tasks complete, all tests passing

## What Was Built

Auto-restore system for archived channels and tenants across 5 integration points:

1. **Message POST route** — Replaced 409 CHANNEL_ARCHIVED rejection with auto-restore + accept (201). Also restores parent tenant if archived.
2. **Document POST route** — Same auto-restore pattern as messages.
3. **SessionStart hook** — Now checks for existing archived session channels via `findByName` before creating new ones. Restores archived channels, reuses active ones.
4. **TeamInboxWatcher.processTeam** — Removed `!channel.userArchived` guard. New team activity always restores regardless of who archived.
5. **TenantService.upsertByCodebasePath** — Removed `!existing.userArchived` guard. New codebase activity always restores regardless of who archived.

## Key Files

### Modified
- `packages/server/src/http/routes/messages.ts` — Auto-restore replacing 409 rejection
- `packages/server/src/http/routes/documents.ts` — Auto-restore replacing 409 rejection
- `packages/server/src/hooks/handlers.ts` — SessionStart channel reuse and restore
- `packages/server/src/watcher/TeamInboxWatcher.ts` — User-archived override
- `packages/server/src/services/TenantService.ts` — User-archived override

### Tests Updated
- `packages/server/src/http/__tests__/messages.test.ts` — 409 test → 201 auto-restore test + tenant cascade test
- `packages/server/src/hooks/__tests__/hooks.test.ts` — SessionStart restore and reuse tests
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — User-archived override test + flaky fix
- `packages/server/src/http/__tests__/tenants.test.ts` — User-archived tenant restore tests

## Test Results

- Server: 211 passed (18 files)
- Client: 91 passed (9 files)
- MCP: 48 passed (4 files)
- **Total: 350 tests, 0 failures**

## Issues Encountered

- Pre-existing flaky test (`processes new team directory appearing after start`) that relies on `fs.watch` timing. Fixed with a retry pattern replacing the fixed 500ms wait. Not related to Phase 21 changes.

## Decisions Recorded

- [Phase 21]: Auto-restore overrides user_archived flag — real activity always wins over archive state
- [Phase 21]: Message/document POST to archived channels returns 201 (auto-restore), not 409
- [Phase 21]: SessionStart checks for existing archived channels via findByName before creating new ones
- [Phase 21]: Tenant cascade — restoring a channel also restores its parent tenant if archived
- [Phase 21]: All auto-restore events logged as structured JSON with trigger type

## Self-Check: PASSED
- [x] All 10 tasks executed
- [x] Code changes committed (3 commits)
- [x] 350 tests passing across all packages
- [x] TypeScript compiles clean
- [x] No regressions
