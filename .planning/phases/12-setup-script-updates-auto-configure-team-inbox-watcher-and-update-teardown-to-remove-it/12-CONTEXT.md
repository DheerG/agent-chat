# Phase 12: Setup Script Updates — Auto-Configure Team Inbox Watcher and Update Teardown to Remove It - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Update setup.sh, teardown.sh, merge-settings.cjs, and README.md to document and expose the team inbox watcher feature added in Phase 11. The server already auto-starts the watcher with sensible defaults (TEAMS_DIR defaults to ~/.claude/teams/). This phase ensures the setup/teardown flow, documentation, and environment variable table are complete.

</domain>

<decisions>
## Implementation Decisions

### Setup script changes
- Add `TEAMS_DIR` env var to the summary output so users know it exists
- Add a line mentioning team inbox watching is enabled by default
- No new flags needed — the default `~/.claude/teams/` is correct for all users since Claude Code always uses that path

### Teardown script changes
- No team-watcher-specific cleanup needed in teardown — the watcher is a server-side feature, not a per-project config
- Teardown only removes per-project Claude Code settings (.claude/settings.json hooks and MCP entries)
- The watcher watches a global directory, not per-project state

### Environment variable documentation
- Add `TEAMS_DIR` to the README Environment Variables table (default: `~/.claude/teams/`)
- Document that team inbox watching starts automatically when the server boots

### README updates
- Update the Status line to mention Phase 11 team inbox ingestion
- Add team inbox watching to the Architecture section
- Add `TEAMS_DIR` to Environment Variables table
- Update the Roadmap section to include Phases 9-12
- Update test count to reflect current state

### Claude's Discretion
- Exact wording of summary output additions
- Whether to add a separate "Team Watching" section to README or fold it into existing sections

</decisions>

<specifics>
## Specific Ideas

- Keep it minimal — the feature works by default, documentation just needs to mention it exists
- The summary output from setup.sh should mention that team conversations from ~/.claude/teams/ are automatically visible in the web UI
- README should explain what team inbox watching does in 1-2 sentences

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/setup.sh`: Summary output section (lines 77-103) — add team watching info here
- `scripts/teardown.sh`: Already handles only AgentChat-specific entries — no changes needed to teardown logic
- `scripts/lib/merge-settings.cjs`: No changes needed — team watching is server-side, not per-project
- `scripts/test-setup.sh`: Existing 6 integration tests — may need minimal update if setup output changes

### Established Patterns
- Environment variables documented in README table format
- Setup summary uses heredoc with human-readable output
- Server env vars: PORT, AGENT_CHAT_DB_PATH pattern (add TEAMS_DIR)

### Integration Points
- `packages/server/src/index.ts` line 34: `TEAMS_DIR` env var already read here
- README.md: Environment Variables table, Architecture section, Roadmap section
- setup.sh: Summary output block

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-setup-script-updates-auto-configure-team-inbox-watcher-and-update-teardown-to-remove-it*
*Context gathered: 2026-03-07*
