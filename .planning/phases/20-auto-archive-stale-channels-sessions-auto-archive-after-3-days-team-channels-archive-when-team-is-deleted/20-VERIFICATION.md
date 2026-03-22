---
phase: 20
status: passed
verified: 2026-03-22
---

# Phase 20 Verification: Auto-archive stale channels

## Phase Goal
Auto-archive stale channels: sessions auto-archive after 3 days, team channels archive when team is deleted.

## Must-Haves Verification

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Session channels inactive 72h+ are auto-archived | PASS | `getStaleSessionChannelsForArchival` query + `AutoArchiveService.runCleanup()` |
| 2 | Session channels with no messages created 72h+ ago are auto-archived | PASS | SQL handles `m.last_activity IS NULL AND c.created_at < datetime('now', '-72 hours')` |
| 3 | User-archived channels NOT touched | PASS | SQL filter: `c.user_archived IS NULL OR c.user_archived != '1'` |
| 4 | Manual/team channels NOT auto-archived by periodic cleanup | PASS | SQL filter: `c.type = 'session'` |
| 5 | Team channels archived when team directory deleted | PASS | `removeTeam()` calls `channels.archive(tenantId, channelId, false)` |
| 6 | Auto-archive uses userInitiated=false | PASS | Both `AutoArchiveService.runCleanup()` and `removeTeam()` pass `false` |
| 7 | Periodic cleanup runs hourly | PASS | `setInterval(..., 3600000)` in `start()` |
| 8 | Timer cleared on SIGTERM | PASS | `autoArchive.stop()` in SIGTERM handler before watcher/WS/HTTP |
| 9 | All existing tests pass | PASS | 345 tests (206 server + 91 client + 48 MCP), 0 failures |

## Artifact Verification

| Artifact | Expected | Actual | Status |
|----------|----------|--------|--------|
| `AutoArchiveService.ts` | Service with start/stop/runCleanup | 87 lines, all methods present | PASS |
| `channels.ts` query | `getStaleSessionChannelsForArchival` | Added, 15 lines SQL | PASS |
| `ChannelService.ts` method | `getStaleSessionChannelsForArchival` | Passthrough to query | PASS |
| `TeamInboxWatcher.ts` | async `removeTeam` with archive | Method updated, awaited in processFileChange | PASS |
| `index.ts` lifecycle | Start/stop AutoArchiveService | Added with import, start after init, stop before watcher | PASS |
| `AutoArchiveService.test.ts` | Tests for cleanup logic | 9 tests, all passing | PASS |
| `TeamInboxWatcher.test.ts` | Tests for team deletion archive | 2 new tests (49 total), all passing | PASS |

## Test Results

```
Server: 206 tests passed (18 files)
Client: 91 tests passed (9 files)
MCP: 48 tests passed (4 files)
Total: 345 tests, 0 failures
```

## Score: 9/9 must-haves verified

## Result: PASSED
