---
phase: 19-differentiated-stale-thresholds
plan: 01
subsystem: database
tags: [sqlite, sql, stale-detection, channel-types]

requires:
  - phase: 18-auto-hide-stale-sessions
    provides: Stale channel detection SQL queries and include_stale API param
provides:
  - Type-aware stale thresholds in SQL queries (session=8h, manual=48h)
  - Tests verifying differentiated stale behavior by channel type
affects: []

tech-stack:
  added: []
  patterns: [CASE-based type-aware SQL thresholds]

key-files:
  created: []
  modified:
    - packages/server/src/db/queries/channels.ts
    - packages/server/src/http/__tests__/channels.test.ts

key-decisions:
  - "Use CASE c.type expression in SQL to switch threshold (no schema changes)"
  - "Use SQLite datetime() in tests for consistent timestamp comparison with query thresholds"

patterns-established:
  - "Type-aware SQL thresholds: CASE c.type WHEN 'session' THEN ... ELSE ... END"

requirements-completed: []

duration: 8min
completed: 2026-03-22
---

# Phase 19: Differentiated Stale Thresholds Summary

**Session channels use 8-hour stale threshold, team/manual channels use 48-hour threshold via CASE expression in SQL queries**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22T17:00:00Z
- **Completed:** 2026-03-22T17:08:00Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Modified `getActiveChannelsByTenant` SQL query to use type-aware CASE expression
- Modified `getChannelsByTenantWithStale` SQL query to use type-aware CASE expression
- Added 6 tests verifying differentiated stale thresholds by channel type
- Zero regressions across all 334 tests (server, client, MCP)

## Task Commits

Each task was committed atomically:

1. **Task 1-2: Update SQL queries** - `f71733f` (feat)
2. **Task 3: Add differentiated threshold tests** - `b8e9e01` (test)

## Files Created/Modified
- `packages/server/src/db/queries/channels.ts` - Type-aware CASE expressions in stale detection queries
- `packages/server/src/http/__tests__/channels.test.ts` - 6 new tests for differentiated thresholds, exposed rawDb for timestamp manipulation

## Decisions Made
- Used CASE c.type WHEN 'session' THEN datetime('now', '-8 hours') ELSE datetime('now', '-48 hours') END in SQL rather than application-level threshold constants
- Used SQLite's datetime() function in test backdateMessages helper to ensure timestamp format matches query comparisons (ISO 8601 T/Z suffixes cause incorrect string comparison with SQLite datetime output)

## Deviations from Plan

### Auto-fixed Issues

**1. Test timestamp format incompatibility**
- **Found during:** Task 3 (tests)
- **Issue:** Using `new Date().toISOString()` in backdateMessages produced ISO format with `T` and `Z` characters that compare incorrectly with SQLite's `datetime()` output (space-separated, no Z)
- **Fix:** Changed backdateMessages to use SQLite's `datetime('now', '-N hours')` for consistent format
- **Files modified:** packages/server/src/http/__tests__/channels.test.ts
- **Verification:** All 6 new tests pass correctly
- **Committed in:** b8e9e01 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (timestamp format)
**Impact on plan:** Essential for correct test behavior. No scope creep.

## Issues Encountered
None beyond the timestamp format issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Differentiated stale thresholds are fully operational
- No further changes needed for this feature
- Ready for next phase

---
*Phase: 19-differentiated-stale-thresholds*
*Completed: 2026-03-22*
