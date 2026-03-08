---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 14 complete
last_updated: "2026-03-08T12:45:00.000Z"
last_activity: "2026-03-08 - Completed Phase 14: Harden team lifecycle"
progress:
  total_phases: 15
  completed_phases: 14
  total_plans: 31
  completed_plans: 27
  percent: 87
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-07)

**Core value:** Agent teams can communicate through structured channels, and humans can observe those conversations in real-time
**Current focus:** v1.0 milestone COMPLETE

## Current Position

Phase: 15 of 15 (tenant-per-codebase fix and UI overhaul)
Plan: 0 of 0 in current phase
Status: Not started
Last activity: 2026-03-08 - Completed Phase 14: Harden team lifecycle

Progress: [████████░░] 87%

## Performance Metrics

**Velocity:**
- Total plans completed: 23
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

### Pending Todos

None.

### Blockers/Concerns

None — all 14 phases complete:
- All requirements verified (INFRA, MSG, AGNT, UI, DOC, SC)
- 252 tests pass (173 server + 79 client)
- Setup scripts: 6 integration tests + 8 self-tests pass
- Zero regressions across all packages

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Improve rendering of messages in the UI. Target common patterns like Markdown to html. | 2026-03-07 | 3234608 | [1-improve-rendering](./quick/1-improve-rendering-of-messages-in-the-ui-/) |
| 2 | Filter out idle_notification noise from team inbox messages | 2026-03-07 | 58b5705 | [2-remove-unknown-tool](./quick/2-remove-unnecessary-unknown-tool-renderin/) |
| 3 | Render team event messages (task_assignment, shutdown_request, shutdown_approved) as compact cards | 2026-03-07 | 99eb336 | [3-render-team-event](./quick/3-render-team-event-messages-task-assignme/) |

## Session Continuity

Last session: 2026-03-08T12:45:00.000Z
Stopped at: Phase 14 complete
Resume file: .planning/ROADMAP.md
