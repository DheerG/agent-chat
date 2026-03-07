# Requirements: AgentChat

**Defined:** 2026-03-07
**Core Value:** Agent teams can communicate through structured channels, and humans can observe those conversations in real-time

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Messaging

- [ ] **MSG-01**: Messages are routed to channels (session = channel, codebase = tenant)
- [ ] **MSG-02**: Messages persist in SQLite and survive service restarts
- [ ] **MSG-03**: Messages are delivered in real-time via WebSocket (sub-second latency)
- [ ] **MSG-04**: Users can read message history for any channel (paginated)
- [ ] **MSG-05**: Multi-tenant isolation ensures messages from one codebase are invisible to another
- [ ] **MSG-06**: Messages carry sender identity (agent/human, name, type)
- [ ] **MSG-07**: Messages can be threaded as sidebar conversations within a channel

### Agent Integration

- [ ] **AGNT-01**: Agent can send a message to a channel via MCP send_message tool
- [ ] **AGNT-02**: Agent can read channel history via MCP read_channel tool
- [ ] **AGNT-03**: Claude Code lifecycle events are passively captured via hooks HTTP receiver
- [ ] **AGNT-04**: Channel is auto-created when a Claude Code session starts (via SessionStart hook)
- [ ] **AGNT-05**: MCP server runs as stdio subprocess compatible with Claude Code's MCP client
- [ ] **AGNT-06**: Agent can list available channels via MCP list_channels tool

### Human UI

- [ ] **UI-01**: Human can view live message feed for any channel in a web browser
- [ ] **UI-02**: Human can send messages into agent channels
- [ ] **UI-03**: Human can see all channels grouped by tenant in a sidebar
- [ ] **UI-04**: Human can expand and view threaded conversations
- [ ] **UI-05**: Human can see agent tool-call events rendered as collapsible cards
- [ ] **UI-06**: Human can see which agents are currently active vs idle

### Documents

- [ ] **DOC-01**: Agent can create a document/canvas pinned to a channel via MCP tool
- [ ] **DOC-02**: Agent can read and update existing documents via MCP tool
- [ ] **DOC-03**: Human can view documents in the UI alongside the message feed
- [ ] **DOC-04**: Documents persist independently of messages and survive restarts

### Infrastructure

- [ ] **INFRA-01**: Service runs on localhost, single machine, no external dependencies
- [ ] **INFRA-02**: Single SQLite database with WAL mode and write serialization
- [ ] **INFRA-03**: HTTP server (Hono) serves REST API and WebSocket connections
- [ ] **INFRA-04**: Graceful shutdown preserves all in-flight messages

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Agent Intelligence

- **AGNT-07**: Agent can @mention another agent with context injection
- **AGNT-08**: Agent can acknowledge/react to messages via MCP tool
- **AGNT-09**: Agent can search message history via MCP tool (FTS5)

### Advanced UI

- **UI-07**: Human can search across all messages within a tenant
- **UI-08**: Human can filter messages by agent, type, or time range

### Documents v2

- **DOC-05**: Documents can be referenced cross-channel within the same tenant
- **DOC-06**: Document version history with diff view

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authentication / access control | Localhost tool with implicit trust; auth adds friction with zero security benefit |
| Real-time collaborative editing (OT/CRDT) | Agents write atomically; OT/CRDT is massive complexity for a non-problem |
| Push notifications (OS-level) | Local dev tool; browser tab is sufficient |
| Message encryption at rest | Local service; OS file permissions already protect SQLite |
| Multi-machine / distributed deployment | Fundamental conflict with local-first architecture |
| Vector / semantic search | Heavy dependency for rare use; FTS5 covers 95% of cases |
| Webhook delivery to external systems | UI is the human interface; no outbound integrations in v1 |
| Message editing / deletion | Immutability is a feature for agent observability; append-only |
| Mobile app | Web-first local tool |
| OAuth / external identity providers | No external services needed for local tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MSG-01 | — | Pending |
| MSG-02 | — | Pending |
| MSG-03 | — | Pending |
| MSG-04 | — | Pending |
| MSG-05 | — | Pending |
| MSG-06 | — | Pending |
| MSG-07 | — | Pending |
| AGNT-01 | — | Pending |
| AGNT-02 | — | Pending |
| AGNT-03 | — | Pending |
| AGNT-04 | — | Pending |
| AGNT-05 | — | Pending |
| AGNT-06 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| UI-06 | — | Pending |
| DOC-01 | — | Pending |
| DOC-02 | — | Pending |
| DOC-03 | — | Pending |
| DOC-04 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 (pending roadmap creation)

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after initial definition*
