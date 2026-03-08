# Plan 15-01 Summary: Fix tenant identity bug

## What was built
Fixed the tenant identity bug in TeamInboxWatcher. The watcher now extracts the actual codebase path from team config `members[].cwd` instead of using the team directory path (`~/.claude/teams/{teamName}`) as the tenant `codebasePath`.

## Key changes
- `TeamInboxWatcher.processTeam()` now reads `config.members[0].cwd` as canonical codebase path
- Tenant name uses `basename(codebasePath)` for human readability (e.g., "agent-chat" instead of team name)
- Falls back to team directory path when no member has `cwd` (backward compatibility)
- Multiple teams on the same codebase share ONE tenant with separate channels

## Key files
- **Modified:** `packages/server/src/watcher/TeamInboxWatcher.ts` — cwd extraction logic
- **Modified:** `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — 5 new tests

## Test results
- 40/40 watcher tests pass (35 existing + 5 new)
- 178/178 full server suite passes
- Zero regressions

## Self-Check: PASSED
