# Phase 23: Live Team Discovery - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

TeamInboxWatcher detects new team directories at runtime without server restart. When a new team directory appears in `~/.claude/teams/` after the server is already running (e.g., user starts a new Claude Code session that creates a team), the watcher picks it up automatically, creates the tenant + channel, and processes any existing messages.

</domain>

<decisions>
## Implementation Decisions

### Discovery mechanism
- Add a periodic scan (polling) as the primary new-team detection mechanism, supplementing the existing `fs.watch({ recursive: true })`
- Poll interval: 5 seconds — fast enough to feel "instant" to the user, low enough overhead for a local tool
- The existing `fs.watch` recursive watcher stays in place for file-level changes (inbox updates, config changes)
- Polling catches teams that `fs.watch` may miss (race conditions, platform differences, Linux `recursive` unreliability)

### Scan behavior
- Reuse the existing `scanTeams()` method logic — it already iterates directory entries and calls `processTeam()`
- `processTeam()` already has the "skip if already processed" guard (`if (this.teams.has(teamName))`)
- The poll scan should also detect team removals — if a previously known team's directory disappears between polls, call `removeTeam()`
- Log new team discovery events as structured JSON (consistent with existing logging pattern)

### Race condition handling
- If a directory exists but has no `config.json` yet, skip it (existing behavior in `processTeam`)
- The next poll cycle (5s later) will pick it up once `config.json` is written
- No special backlog processing needed — `processTeam` already calls `processTeamInboxes` which reads all existing messages

### Cleanup on stop
- Clear the poll interval timer in `stop()` method
- Existing `stop()` already handles FSWatcher cleanup, debounce timers, and dedup keys

### Claude's Discretion
- Exact implementation of the poll interval (setInterval vs recursive setTimeout)
- Whether to log every poll scan or only when changes are detected
- Test structure and helper organization

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scanTeams()` method: Already iterates `readdirSync(this.teamsDir)` and processes each team — can be adapted for periodic re-scanning
- `processTeam()` method: Has `if (this.teams.has(teamName))` guard that makes re-scanning idempotent
- `removeTeam()` method: Full cleanup including channel archival, dedup key cleanup, lastProcessedIndex cleanup, debounce timer cleanup

### Established Patterns
- Structured JSON logging: `console.log(JSON.stringify({ event: '...', ... }))`
- Team state tracking via `this.teams` Map keyed by teamName
- FSWatcher array for cleanup in `stop()`
- 100ms debounce on file change events

### Integration Points
- `start()` method: Poll interval setup goes here, after initial `scanTeams()` and `fs.watch` setup
- `stop()` method: Poll interval cleanup goes here, before/alongside existing cleanup
- No new dependencies needed — uses only Node.js built-ins already imported

</code_context>

<specifics>
## Specific Ideas

- User's exact words: "if I start a new session in any of my terminals with Claude Code and it starts a new agent team, the agent team does not get picked up by Agent Chat until I restart Agent Chat"
- The fix should feel instant to the user — within a few seconds of a new team appearing, it should show up in the UI
- This is a reliability improvement, not a new feature — the watcher should "just work" for new teams without restart

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-live-team-discovery*
*Context gathered: 2026-03-24*
