---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 22 plan 01 complete
last_updated: "2026-03-22T15:36:14.102Z"
last_activity: "2026-03-08 - Completed Phase 16: npx-based install and uninstall scripts"
progress:
  total_phases: 22
  completed_phases: 18
  total_plans: 41
  completed_plans: 33
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-07)

**Core value:** Agent teams can communicate through structured channels, and humans can observe those conversations in real-time
**Current focus:** v1.0 milestone COMPLETE

## Current Position

Phase: 20 of 16
Plan: 1 of 1 in current phase
Status: Complete
Last activity: 2026-03-08 - Completed Phase 16: npx-based install and uninstall scripts

Progress: [████████░░] 79%

## Performance Metrics

**Velocity:**
- Total plans completed: 31
- Average duration: ---
- Total execution time: ---

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3 | - | - |
| 2 | 3 | - | - |
| 3 | 3 | - | - |
| 4 | 3 | - | - |
| 5 | 3 | - | - |
| 6 | 3 | - | - |
| 7 | 2 | - | - |
| 8 | 1 | - | - |
| 9 | 2 | - | - |
| 10 | 1 | - | - |
| 11 | 2 | - | - |
| 12 | 1 | - | - |
| 13 | 1 | - | - |
| 14 | 2 | - | - |
| 15 | 2 | - | - |
| 16 | 1 | - | - |

**Recent Trend:**
- Last 5 plans: ---
- Trend: ---

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: TypeScript full-stack (server, client, MCP) — consistent language, user preference
- [Init]: Local-only on localhost with SQLite — no external dependencies
- [Init]: MCP v1 stdio transport only — v2 is pre-alpha, do not use
- [Phase 3]: Hook event normalization: SessionStart creates channels, PreToolUse/PostToolUse stored as event messages, unknown events discarded
- [Phase 3]: Agent identity uses session_id as canonical agent_id
- [Phase 3]: MCP SDK v1.27.1 supports both zod v3 and v4 — no version conflict
- [Phase 3]: Server package uses lib.ts as side-effect-free library entry point with exports map
- [Phase 4]: Single WebSocket connection per client, multiplexed across channels via subscribe/unsubscribe
- [Phase 4]: EventEmitter pattern for decoupling MessageService from WebSocketHub broadcast
- [Phase 4]: Cursor-based reconnect catch-up using ULID lastSeenId, reusing existing pagination
- [Phase 4]: ws npm package in noServer mode for HTTP upgrade handling
- [Phase 5]: React 18 SPA with Vite bundler and vitest + @testing-library/react for tests
- [Phase 5]: Message state lifted from MessageFeed to App for ThreadPanel shared access
- [Phase 5]: WebSocket reconnect with exponential backoff (1s-30s max)
- [Phase 5]: Message deduplication via Set to handle REST+WS race conditions
- [Phase 6]: Documents table with ULID IDs, tenant isolation, channel association, and content_type enum
- [Phase 6]: DocumentService emits document:created and document:updated events via EventEmitter
- [Phase 6]: MCP tools use snake_case args (channel_id, document_id) matching existing conventions
- [Phase 6]: list_documents returns metadata only (no content field) to keep payloads small
- [Phase 6]: WebSocket document events reuse channel subscription model
- [Phase 6]: DocumentPanel placed below MessageFeed with expand/collapse content view
- [Phase 7]: Raw SQL for IS NULL/IS NOT NULL queries due to Drizzle ORM 0.45.1 compatibility issue
- [Phase 7]: TenantService takes ChannelQueries for cascading archive/restore
- [Phase 7]: refreshKey pattern for triggering hook re-fetches from App state
- [Phase 7]: Archived section collapsed by default, fetches data only when expanded
- [Phase 9]: CSS custom properties (design tokens) on :root in App.css for all colors
- [Phase 9]: WCAG AA contrast: #8a8a9a for sidebar muted text, #718096 for timestamps/muted on white
- [Phase 9]: ConfirmDialog component replaces window.confirm() for archive operations
- [Phase 9]: Archive buttons are real <button> elements inside div[role=button] parent (avoids nested buttons)
- [Phase 9]: ARIA landmarks: aside[aria-label=Channel navigation], main[aria-label=Message area], aside[aria-label=Thread replies]
- [Phase 9]: Message list has role=log and aria-live=polite for screen reader support
- [Phase 10]: Archived channels return 409 CHANNEL_ARCHIVED on write attempts (POST messages, POST documents)
- [Phase 10]: GET operations on archived channels still allowed for historical access
- [Phase 10]: Tenant upsert updates name when codebasePath matches but name differs
- [Phase 10]: updateTenantName uses Drizzle ORM set() for consistency with other queries
- [Phase 11]: TeamInboxWatcher watches ~/.claude/teams/ with fs.watch (recursive) + 100ms debounce
- [Phase 11]: Team → Tenant mapping via upsertByCodebasePath(teamName, teamPath)
- [Phase 11]: Single channel per team (manual type), all messages in one group chat view
- [Phase 11]: Dedup key: from|timestamp|sha256(text).slice(0,16) — handles broadcast duplicates across inboxes
- [Phase 11]: Structured messages (idle_notification, shutdown_request) detected via JSON parse + type field → messageType 'event'
- [Phase 11]: TEAMS_DIR env var overrides default ~/.claude/teams/ path
- [Phase 11]: Watcher stops FIRST in SIGTERM shutdown sequence (before WebSocket, HTTP, DB)
- [Phase 12]: setup.sh summary updated with team watching info and TEAMS_DIR override
- [Phase 12]: README.md updated with TEAMS_DIR env var, team watching architecture, Phases 9-12, corrected port
- [Phase 14]: TenantService.upsertByCodebasePath auto-restores archived tenants and cascades to channels
- [Phase 14]: TeamInboxWatcher.removeTeam cleans internal state when team directory disappears
- [Phase 14]: Directory-gone detection in processFileChange prevents stale team state
- [Phase 14]: Stricter inbox validation rejects non-object entries in inbox arrays
- [Phase 15]: TeamInboxWatcher uses config.members[].cwd as codebase path, falls back to team dir path
- [Phase 15]: Multiple teams on same codebase share ONE tenant with separate channels
- [Phase 15]: Sidebar refactored from expandable tenant groups to dropdown tenant switcher
- [Phase 15]: useTenants hook lifted from Sidebar to App.tsx for parent-controlled selection
- [Phase 15]: localStorage persistence for selected tenant with safe fallback for test environments
- [Phase 15]: ChannelHeader component shows channel name and tenant context above message feed
- [Phase 15]: Message grouping: same sender within 5min gets collapsed avatar/header
- [Phase 15]: Date separators with "Today"/"Yesterday"/full date format between different days
- [Phase 16]: CLI at bin/cli.js with install/uninstall subcommands, --global and --project flags
- [Phase 16]: Global install: hooks in ~/.claude/settings.json, MCP in ~/.claude/.mcp.json (no AGENT_CHAT_CWD)
- [Phase 16]: Project install: hooks in <project>/.claude/settings.json, MCP in <project>/.mcp.json (with AGENT_CHAT_CWD)
- [Phase 16]: merge-settings.cjs exports functions for reuse while maintaining backward CLI compatibility
- [Phase 16]: package.json bin field enables npx agent-chat usage
- [Phase 17]: getChannelByName query finds channels regardless of archive status for conversation continuity
- [Phase 17]: ChannelService.findByName returns any channel (active or archived) by name within a tenant
- [Phase 17]: TeamInboxWatcher.processTeam uses findByName + auto-restore pattern (mirrors TenantService upsert)
- [Phase 18]: user_archived TEXT column on channels and tenants distinguishes user-initiated from system archives
- [Phase 18]: Stale detection via LEFT JOIN with MAX(messages.created_at) and 48-hour threshold
- [Phase 18]: GET /channels defaults to hiding stale (no messages or 48h+ inactive); include_stale=true shows all with stale boolean
- [Phase 18]: TeamInboxWatcher respects user_archived flag — does NOT auto-restore user-archived channels
- [Phase 18]: TenantService.upsertByCodebasePath respects user_archived flag — does NOT auto-restore user-archived tenants
- [Phase 18]: Sidebar stale toggle persists in localStorage (agentchat_show_stale key)
- [Phase 19]: Stale threshold is type-aware: session channels use 8h, manual/team channels use 48h
- [Phase 19]: SQL CASE expression on c.type in both getActiveChannelsByTenant and getChannelsByTenantWithStale
- [Phase 19]: No schema migration, API, or UI changes — purely SQL query logic change
- [Phase 20]: AutoArchiveService runs hourly, archives session channels inactive 72h+
- [Phase 20]: TeamInboxWatcher.removeTeam archives channel (system-initiated) on team directory deletion
- [Phase 20]: getStaleSessionChannelsForArchival query scans ALL tenants (not tenant-scoped)
- [Phase 20]: System-initiated archives (userInitiated=false) allow auto-restore when teams reappear
- [Phase 21]: POST to archived channel auto-restores and accepts (201), replaces 409 CHANNEL_ARCHIVED rejection
- [Phase 21]: SessionStart hook reuses existing archived session channels via findByName before creating new ones
- [Phase 21]: Auto-restore overrides user_archived flag — real activity always wins over archive state
- [Phase 21]: Tenant cascade: restoring a channel also restores its archived parent tenant
- [Phase 21]: All auto-restore events logged as structured JSON with trigger type (message, document, session_start, team_reappearance, upsert)
- [Phase 22]: processTeam compares config.createdAt vs channel.sessionId to distinguish same vs different sessions
- [Phase 22]: Different session with same team name creates disambiguated channel (name-2, name-3, etc.)
- [Phase 22]: Same session (same createdAt) reuses existing channel (Phase 17 behavior preserved)
- [Phase 22]: New team channels store config.createdAt in sessionId field for future comparison
- [Phase 22]: getChannelsByNamePrefix query uses SQLite GLOB for finding disambiguated variants
- [Phase 22]: seenMessages dedup keys tracked per team and cleaned up on removeTeam
- [Phase 22]: Legacy channels (null sessionId) treated as different session, get disambiguated channel

### Roadmap Evolution

- Phase 7 added: Channel and Tenant Archiving — UI for archiving/restoring channels and tenants
- Phase 7 completed: All 2 plans executed and verified
- Phase 8 added: Add process and ability to add this to existing local codebases to test this.
- Phase 8 completed: All 1 plan executed and verified
- Phase 9 added: UI polish — fix accessibility, contrast, dead code, and design system gaps from design audit
- Phase 9 completed: All 2 plans executed and verified
- Phase 10 added: Fix dogfood bugs — archived channel writes, failing client tests, tenant upsert name
- Phase 10 completed: All 1 plan executed and verified
- Phase 11 added: Team inbox ingestion — file watcher that syncs ~/.claude/teams/ messages into AgentChat channels in real-time
- Phase 11 completed: All 2 plans executed and verified
- Phase 12 added: Setup script updates — auto-configure team inbox watcher and update teardown to remove it
- Phase 12 completed: All 1 plan executed and verified
- Phase 13 added: Add MCP layer for agent team context persistence and recovery
- Phase 14 added: Harden team lifecycle — archived team reuse, same-name conflicts, and ingestion edge cases
- Phase 14 completed: All 2 plans executed and verified
- Phase 15 added: Tenant-per-codebase fix and UI overhaul — tenant scoping, sidebar navigation, and channel management
- Phase 15 completed: All 2 plans executed and verified
- Phase 16 added: npx-based install and uninstall scripts for global and project-specific MCP and hooks config
- Phase 16 completed: All 1 plan executed and verified
- Phase 17 added: Link team channels for conversation continuity
- Phase 17 completed: All 1 plan executed and verified
- Phase 18 added: Auto-hide stale sessions — channels with no activity in 48 hours are hidden by default
- Phase 18 completed: All 2 plans executed and verified
- Phase 19 added: Differentiated stale thresholds — session channels hide after 8h, team channels hide after 48h
- Phase 19 completed: All 1 plan executed and verified
- Phase 20 added: Auto-archive stale channels — sessions auto-archive after 3 days, team channels archive when team deleted
- Phase 20 completed: All 1 plan executed and verified
- Phase 21 added: Auto-restore archived channels on new activity — self-healing archive/restore cycle
- Phase 21 completed: All 1 plan executed and verified
- Phase 22 added: Fix team channel reuse conflict — session identity detection and channel disambiguation
- Phase 22 completed: All 1 plan executed and verified

### Pending Todos

None.

### Blockers/Concerns

None — all 20 phases complete:
- All requirements verified (INFRA, MSG, AGNT, UI, DOC, SC)
- 318 tests pass (183 server + 87 client + 48 MCP)
- Setup scripts: 12 integration tests + 13 self-tests pass
- Zero regressions across all packages

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Improve rendering of messages in the UI. Target common patterns like Markdown to html. | 2026-03-07 | 3234608 | [1-improve-rendering](./quick/1-improve-rendering-of-messages-in-the-ui-/) |
| 2 | Filter out idle_notification noise from team inbox messages | 2026-03-07 | 58b5705 | [2-remove-unknown-tool](./quick/2-remove-unnecessary-unknown-tool-renderin/) |
| 3 | Render team event messages (task_assignment, shutdown_request, shutdown_approved) as compact cards | 2026-03-07 | 99eb336 | [3-render-team-event](./quick/3-render-team-event-messages-task-assignme/) |

## Session Continuity

Last session: 2026-03-22T15:36:14.096Z
Stopped at: Phase 22 plan 01 complete
Resume file: .planning/phases/22-fix-team-channel-reuse-conflict-when-a-team-name-is-reused-across-branches-append-session-id-to-avoid-channel-name-collisions-and-ensure-new-messages-are-ingested/22-01-SUMMARY.md
