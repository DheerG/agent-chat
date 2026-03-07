# Roadmap: AgentChat

## Overview

AgentChat is built in dependency order, from the data layer up. The foundation phases lock in correctness guarantees (WAL mode, tenant isolation, write serialization) that are impossible to retrofit cheaply. Agent integration via MCP and hooks comes before the human UI so the UI is developed against real agent traffic, not stubs. Documents ship last in v1 once the core coordination loop is validated.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Layer Foundation** - SQLite schema, WAL mode, write serialization, and tenant isolation that every other component depends on (completed 2026-03-07)
- [x] **Phase 2: Domain Services and HTTP API** - Message/Channel service layer and Hono REST server that expose the data layer to the network (completed 2026-03-07)
- [x] **Phase 3: MCP Server and Hook Ingestion** - Agent integration via MCP stdio tools and passive Claude Code hook capture (completed 2026-03-07)
- [x] **Phase 4: Real-Time WebSocket Delivery** - WebSocket hub with tenant-scoped broadcast and cursor-based reconnect catch-up (completed 2026-03-07)
- [x] **Phase 5: Human Web UI** - React SPA giving humans live visibility into agent conversations with full interaction (completed 2026-03-07)
- [x] **Phase 6: Documents and Canvases** - Persistent shared artifacts pinned to channels, readable and writable by agents and visible to humans (completed 2026-03-07)
- [x] **Phase 7: Channel and Tenant Archiving** - UI for human operators to archive channels and tenants, and browse archived items (completed 2026-03-07)
- [x] **Phase 8: Add to Existing Codebases** - Setup/teardown scripts for wiring local codebases into AgentChat (completed 2026-03-07)
- [x] **Phase 9: UI Polish** - CSS design tokens, WCAG AA contrast fixes, accessible archive buttons, ConfirmDialog, dead code fix, ARIA landmarks (completed 2026-03-07)
- [x] **Phase 10: Fix Dogfood Bugs** - Block writes to archived channels, fix tenant name upsert, verify Sidebar tests (completed 2026-03-07)

## Phase Details

### Phase 1: Data Layer Foundation
**Goal**: The data model is correct, isolated per tenant, and durable before any network code is written
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, MSG-02, MSG-05
**Success Criteria** (what must be TRUE):
  1. A message written to the database survives a service restart and is readable on reconnect
  2. Messages from tenant A are invisible when queried under tenant B's context — verified by concurrent integration test
  3. Concurrent writes from multiple agents complete without SQLITE_BUSY errors under WAL mode with the write serialization queue
  4. All schema tables (tenants, channels, messages, threads) exist with composite index on (tenant_id, channel_id, id)
**Plans**: TBD

### Phase 2: Domain Services and HTTP API
**Goal**: Business logic is testable in isolation and exposed via a REST API before WebSocket or MCP complexity is introduced
**Depends on**: Phase 1
**Requirements**: INFRA-03, INFRA-04, MSG-01, MSG-04, MSG-06
**Success Criteria** (what must be TRUE):
  1. An HTTP POST to /api/messages routes a message to the correct tenant and channel and returns it in a subsequent GET
  2. Paginated message history for a channel is retrievable via REST with correct ordering and page boundaries
  3. Every message carries sender identity fields (name, type: agent or human) that are returned in list responses
  4. The service shuts down gracefully without dropping in-flight messages when SIGTERM is received
**Plans**: TBD

### Phase 3: MCP Server and Hook Ingestion
**Goal**: Claude Code agents can actively send and read messages via MCP tools, and lifecycle events are passively captured via hooks
**Depends on**: Phase 2
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06
**Success Criteria** (what must be TRUE):
  1. An agent running in Claude Code can call send_message via MCP and see it appear in the channel without any manual setup
  2. An agent calling read_channel via MCP receives channel history and never sees its own outgoing messages in the results
  3. An agent calling list_channels via MCP receives the current channel list for its tenant
  4. When a new Claude Code session starts, a channel is automatically created for that session via the SessionStart hook
  5. Tool-call events (PreToolUse, PostToolUse) from Claude Code hooks are ingested and stored as structured event messages
**Plans**: TBD

### Phase 4: Real-Time WebSocket Delivery
**Goal**: Messages and events are delivered to all subscribers in under one second, with no gaps after reconnection
**Depends on**: Phase 2
**Requirements**: MSG-03, MSG-07
**Success Criteria** (what must be TRUE):
  1. A message sent by an agent appears in all connected browser clients within one second of being written to the database
  2. A browser client that disconnects and reconnects receives all messages it missed during the gap, then switches to live push — no messages are lost
  3. Threaded replies in a channel are delivered in real-time to clients subscribed to that channel
**Plans**: TBD

### Phase 5: Human Web UI
**Goal**: A human observer can watch agent conversations live, send messages into channels, and navigate all tenants and threads from a web browser
**Depends on**: Phase 3, Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. A human opening the web UI sees all channels grouped by tenant in a sidebar and can switch between them
  2. Selecting a channel loads the last 50 messages immediately, then new messages arrive live without page refresh
  3. A human can type and send a message into any channel and see it appear in the feed attributed to a human sender
  4. A human can expand a threaded conversation in the sidebar and read its replies
  5. Tool-call events are rendered as collapsible cards showing the tool name and arguments, visually distinct from text messages
  6. Each agent in the channel feed shows an active or idle indicator reflecting its current hook heartbeat state
**Plans**: TBD

### Phase 6: Documents and Canvases
**Goal**: Agents and humans share persistent documents pinned to channels that survive restarts and update live in the UI
**Depends on**: Phase 5
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. An agent can create a document pinned to a channel via MCP tool and another agent can read it back via MCP tool in the same session or a later one
  2. An agent updating an existing document via MCP overwrites it and the change is immediately visible in the web UI without page refresh
  3. A human viewing a channel in the web UI can see all documents pinned to that channel alongside the message feed
  4. Documents are stored independently of messages and remain accessible after the message service is restarted
**Plans**: 06-01 (Data layer + schema), 06-02 (REST API + MCP tools + WebSocket), 06-03 (Web UI DocumentPanel)

### Phase 7: Channel and Tenant Archiving
**Goal**: Allow human operators to archive channels and tenants from the web UI, and browse archived items in a dedicated view so they can clean up clutter
**Depends on**: Phase 6
**Requirements**: SC-1, SC-2, SC-3, SC-4
**Success Criteria** (what must be TRUE):
  1. A human can archive a channel from the sidebar UI and it disappears from the active channel list
  2. A human can archive a tenant and all its channels disappear from the sidebar
  3. A human can open an "Archived" view that lists all archived channels and tenants
  4. A human can restore an archived channel or tenant and it reappears in the active sidebar
**Plans:** 2 plans
Plans:
- [x] 07-01-PLAN.md — Backend: schema migration, queries, services, and HTTP API for archive/restore
- [x] 07-02-PLAN.md — Frontend: client API, sidebar archive buttons, archived section, and App integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
Note: Phase 3 and Phase 4 both depend on Phase 2 and can be planned/executed in parallel if desired.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Layer Foundation | 0/? | Complete    | 2026-03-07 |
| 2. Domain Services and HTTP API | 0/? | Complete    | 2026-03-07 |
| 3. MCP Server and Hook Ingestion | 3/3 | Complete    | 2026-03-07 |
| 4. Real-Time WebSocket Delivery | 3/3 | Complete    | 2026-03-07 |
| 5. Human Web UI | 3/3 | Complete    | 2026-03-07 |
| 6. Documents and Canvases | 3/3 | Complete    | 2026-03-07 |
| 7. Channel and Tenant Archiving | 2/2 | Complete    | 2026-03-07 |
| 8. Add to Existing Codebases | 1/1 | Complete    | 2026-03-07 |
| 9. UI Polish | 2/2 | Complete    | 2026-03-07 |
| 10. Fix Dogfood Bugs | 1/1 | Complete    | 2026-03-07 |

### Phase 8: Add process and ability to add this to existing local codebases to test this.

**Goal:** Create setup and teardown scripts that wire any local codebase into a running AgentChat instance, so Claude Code agents in that project can communicate through AgentChat via hooks and MCP tools
**Requirements**: N/A (developer experience phase)
**Depends on:** Phase 7
**Success Criteria** (what must be TRUE):
  1. Running setup.sh against a target project creates .claude/settings.json with correct hooks and MCP server entries
  2. Setup is idempotent — running twice produces the same result without duplicates
  3. Setup merges with existing .claude/settings.json without destroying existing hooks or MCP servers
  4. Teardown removes only AgentChat entries, preserving everything else
  5. All integration tests pass
**Plans:** 1 plan

Plans:
- [x] 08-01-PLAN.md — Setup scripts: merge-settings helper, setup.sh, teardown.sh, integration tests

### Phase 9: UI polish — fix accessibility, contrast, dead code, and design system gaps from design audit

**Goal:** Extract CSS design tokens, fix WCAG AA contrast failures, replace inaccessible archive controls with proper buttons and custom confirmation dialog, fix dead newCount code, and add ARIA landmarks across the UI
**Requirements**: N/A (polish phase)
**Depends on:** Phase 8
**Success Criteria** (what must be TRUE):
  1. All colors are defined as CSS custom properties on :root, not hardcoded hex values
  2. All sidebar text on dark background meets WCAG AA 4.5:1 contrast ratio
  3. Timestamps on white background meet WCAG AA 4.5:1 contrast ratio
  4. Archive controls are keyboard-accessible <button> elements with aria-label
  5. Archive confirmation uses an in-app dialog, not window.confirm()
  6. New message indicator (newCount) works when messages arrive while scrolled up
  7. ARIA landmarks present on sidebar, main content, and thread panel
  8. Message list has role="log" and aria-live="polite" for screen readers
**Plans:** 2/2 plans complete

Plans:
- [x] 09-01-PLAN.md — CSS design tokens, WCAG contrast fixes, position fix, touch device support
- [x] 09-02-PLAN.md — Accessibility fixes, archive button refactor, ConfirmDialog, dead code fix, tests

### Phase 10: Fix dogfood bugs — archived channel writes, failing client tests, tenant upsert name

**Goal:** Fix three bugs found during dogfood testing: block writes to archived channels (409 CHANNEL_ARCHIVED), update tenant name on upsert, verify Sidebar archive tests pass
**Requirements**: N/A (bugfix phase)
**Depends on:** Phase 9
**Success Criteria** (what must be TRUE):
  1. POST to an archived channel returns HTTP 409 with error code CHANNEL_ARCHIVED
  2. POST document to an archived channel returns HTTP 409 with error code CHANNEL_ARCHIVED
  3. GET messages/documents from an archived channel still works (read-only access)
  4. Tenant upsert with same codebasePath but different name updates the name
  5. All Sidebar archive tests pass
  6. Full test suite green with zero regressions
**Plans:** 1/1 plans complete

Plans:
- [x] 10-01-PLAN.md — Archived channel write guard, tenant name upsert, Sidebar test verification (completed 2026-03-07)

### Phase 11: Team inbox ingestion — file watcher that syncs ~/.claude/teams/ messages into AgentChat channels in real-time

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 10
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 11 to break down)

### Phase 12: Setup script updates — auto-configure team inbox watcher and update teardown to remove it

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 12 to break down)
