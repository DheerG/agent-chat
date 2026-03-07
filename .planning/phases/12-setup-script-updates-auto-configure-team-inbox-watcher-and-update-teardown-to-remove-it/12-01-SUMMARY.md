# Plan 12-01 Summary: Setup Script and README Updates

**Status:** Complete
**Duration:** ~5 min

## What Was Built

Updated setup.sh summary output and README.md to document the team inbox watcher feature from Phase 11.

### Key Changes

**Modified:**
- `scripts/setup.sh` — Added team watching line to settings summary and TEAMS_DIR override info
- `README.md` — Updated status, port numbers, env vars, architecture, roadmap, test count

### Details

1. **setup.sh:** Added "Team Watching" line to the settings summary and a "Team conversations" section documenting the TEAMS_DIR override.
2. **README.md Status:** Updated from "Phase 8 of 8" to "All 12 phases complete" with team inbox watching mentioned.
3. **README.md Port Fix:** Corrected port from 3000 to 5555 (actual default from server code).
4. **README.md Env Vars:** Added `TEAMS_DIR` (`~/.claude/teams/`) to the environment variables table.
5. **README.md Architecture:** Added team inbox watching bullet to the architecture section.
6. **README.md Roadmap:** Added Phases 9-12 to the roadmap checklist.
7. **README.md Tests:** Updated test count from 163 to 200 (143 server + 57 client).

### Test Results

- merge-settings.cjs self-tests: 8/8 pass
- test-setup.sh integration tests: 6/6 pass
- Server tests: 143/143 pass
- Client tests: 57/57 pass
- Total: 200 tests, zero regressions

## Self-Check: PASSED

- [x] setup.sh summary mentions team inbox watching
- [x] setup.sh summary mentions TEAMS_DIR env var
- [x] README.md Environment Variables table includes TEAMS_DIR
- [x] README.md Architecture section mentions team inbox watching
- [x] README.md Roadmap includes Phases 9-12
- [x] README.md status line is current
- [x] README.md port numbers are correct (5555, not 3000)
- [x] merge-settings.cjs self-tests pass (8/8)
- [x] test-setup.sh integration tests pass (6/6)
- [x] Server test suite passes with no regressions (143/143)
- [x] Client test suite passes with no regressions (57/57)
