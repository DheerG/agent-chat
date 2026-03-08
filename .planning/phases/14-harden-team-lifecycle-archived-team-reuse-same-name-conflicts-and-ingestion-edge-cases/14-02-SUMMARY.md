# Plan 14-02 Summary: Harden TeamInboxWatcher

**Status:** Complete
**Duration:** ~5 minutes

## What Was Built

Hardened the TeamInboxWatcher against edge cases in the team lifecycle: directory disappearance, rapid team create/delete cycles, malformed inbox files with non-object entries, and partial JSON writes.

## Key Changes

1. **removeTeam method** — Cleans up internal state (teams map, lastProcessedIndex, debounce timers) when a team directory disappears, without touching the database
2. **Directory-gone detection** — processFileChange now checks if a known team's directory still exists before processing events; removes stale team state when it doesn't
3. **Stricter inbox validation** — Added `typeof msg !== 'object'` check to skip non-object entries (numbers, strings, booleans, arrays) in inbox arrays
4. **4 robustness tests** covering directory disappearance, delete/recreate cycles, non-object entries, and truncated JSON

## Key Files

### Created
- None (all changes to existing files)

### Modified
- `packages/server/src/watcher/TeamInboxWatcher.ts` — Added removeTeam, directory-gone detection, stricter validation
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — Added 4 robustness tests

## Self-Check: PASSED

- [x] TypeScript compiles without errors
- [x] All 35 TeamInboxWatcher tests pass (4 new)
- [x] Full server suite: 173 tests pass
- [x] Full client suite: 79 tests pass
- [x] Zero regressions

## Decisions Made

- removeTeam does NOT modify the database — archived/historical data is preserved
- Directory disappearance logs a structured JSON event for observability
- 600ms wait in truncated JSON test to handle fs.watch timing under load
