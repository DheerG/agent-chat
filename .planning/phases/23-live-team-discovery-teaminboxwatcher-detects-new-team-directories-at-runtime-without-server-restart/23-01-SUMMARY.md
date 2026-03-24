---
phase: 23-live-team-discovery
plan: 01
subsystem: infra
tags: [fs-watch, polling, team-discovery, watcher]

requires:
  - phase: 22-fix-team-channel-reuse-conflict
    provides: TeamInboxWatcher with session identity and channel disambiguation
provides:
  - Periodic poll scan for runtime team directory discovery
  - Automatic detection and cleanup of removed team directories
  - Fix for flaky fs.watch-based file watching test
affects: [team-inbox-watcher, server-lifecycle]

tech-stack:
  added: []
  patterns: [setInterval polling with cleanup on stop]

key-files:
  created: []
  modified:
    - packages/server/src/watcher/TeamInboxWatcher.ts
    - packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts

key-decisions:
  - "5-second poll interval for team directory scanning"
  - "pollForNewTeams() detects both new and removed teams"
  - "Existing fs.watch recursive watcher retained for file-level changes"
  - "Poll fallback added to flaky existing test"

patterns-established:
  - "Poll + watch dual strategy: fs.watch for speed, polling for reliability"

requirements-completed: []

duration: 8min
completed: 2026-03-24
---

# Phase 23: Live Team Discovery Summary

**TeamInboxWatcher now discovers new team directories at runtime via 5-second polling, eliminating the need for server restart when users start new Claude Code sessions.**

## Performance

- **Duration:** 8 min
- **Tasks:** 3/3 completed
- **Files modified:** 2
- **Tests added:** 6 new, 1 fixed

## Accomplishments

### Task 1: Add periodic poll scan to TeamInboxWatcher
- Added `POLL_INTERVAL_MS` constant (5 seconds)
- Added `pollTimer` field with cleanup in `stop()`
- Added `pollForNewTeams()` method that:
  - Scans directory for entries not in `this.teams` Map
  - Processes new teams (creates tenant + channel, processes backlog)
  - Detects removed teams and triggers `removeTeam()` cleanup
- Timer started in `start()` after initial scan and fs.watch setup

### Task 2: Add tests for live team discovery
- 6 new tests in "Live team discovery (polling)" describe block:
  - Discovers new team created after watcher start (with backlog)
  - Detects removed team directory via polling
  - Idempotent polling (no re-processing of known teams)
  - Multiple new teams in a single poll cycle
  - Skips directories without config.json
  - Team appearing then disappearing across poll cycles

### Task 3: Fix flaky existing test
- The existing "processes new team directory appearing after start" test was flaky under full-suite load (fs.watch events delayed)
- Added `pollForNewTeams()` fallback, matching actual production behavior

## Self-Check: PASSED

All tests pass:
- Server: 223 tests (18 files)
- Client: 91 tests (9 files)
- MCP: 48 tests (4 files)
- TypeScript compilation: clean
