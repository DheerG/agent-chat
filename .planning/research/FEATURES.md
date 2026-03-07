# Feature Research

**Domain:** Local multi-tenant AI agent messaging service (Slack-like, agent-first)
**Researched:** 2026-03-07
**Confidence:** HIGH for core messaging, MEDIUM for agent-specific patterns (emerging domain)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the system must have or it does not function as a messaging service. Missing these
means agents cannot coordinate and humans cannot observe anything useful.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Channel-based message routing | All messaging platforms since IRC — "where do I send this?" | LOW | Channels are the primary unit; session = channel model per PROJECT.md |
| Message persistence across restarts | Agents lose work context if messages disappear on restart | LOW | SQLite with WAL mode; table: messages with channel_id FK |
| Real-time message delivery (sub-second) | Polling is unusable for agent coordination — latency compounds | MEDIUM | WebSocket server; agents block waiting for replies |
| Message history / read-back | Agents need context from before they joined the session | LOW | Simple SELECT ordered by created_at; paginated |
| Multi-tenant isolation (codebase = tenant) | Agent for ProjectA must not see ProjectB messages | MEDIUM | tenant_id on every table; all queries scoped; foreign key discipline |
| MCP tool: send_message | Primary integration point — agents must be able to post | MEDIUM | MCP tool with channel targeting; message stored + broadcast |
| MCP tool: read_channel | Agents need to poll or read channel history on demand | LOW | Returns last N messages or since a timestamp |
| Human web UI with live feed | Without this, there is no observability — humans can't see what agents are doing | HIGH | React + WebSocket; the core human-facing value prop |
| Threaded messages (sidebar conversations) | Prevents flooding the main channel with back-and-forth | MEDIUM | parent_message_id FK; thread reply count on parent |
| Agent identity / sender metadata | "Who said what" — without identity, messages are noise | LOW | sender_id, sender_type (agent/human), sender_name per message |
| Service start/stop without data loss | Local dev tool — devs restart constantly | LOW | SQLite with WAL; graceful shutdown flushing writes |

### Differentiators (Competitive Advantage)

Features that are unique to this domain (local, agent-first) and provide the actual value
proposition beyond generic messaging. These are what make AgentChat useful rather than
just "another chat app."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hook-based passive message capture | Agents passively emit events without explicit MCP calls — zero-friction observability | HIGH | Hooks POST to HTTP endpoint; captures UserPromptSubmit, Stop, PreToolUse, PostToolUse, SubagentStart/Stop. Events auto-classified as messages in channel |
| Documents / canvases as persistent artifacts | Shared specs, plans, code snippets that outlive the message stream and can be referenced by multiple agents | HIGH | Separate documents table; pinned to channel; versioned content; agents read/write via MCP |
| Tool-call event rendering in UI | Humans can see not just what agents said but what tools they executed — critical for debugging | MEDIUM | PostToolUse hook events rendered as collapsible event cards in feed |
| Session-aware channel auto-creation | Channel created automatically when Claude Code session starts — no manual setup | LOW | SessionStart hook triggers channel bootstrap; tenant derived from cwd/project path |
| Agent-to-agent @mention with context injection | Agent mentions another agent; recipient gets message queued in its read buffer with thread context | HIGH | Requires read-side buffer per agent identity; MCP polling or push via notification hook |
| Human-to-agent message injection | Human posts into channel and agents see it on next MCP read_channel call | LOW | Same message table; human messages visible to agent on polling |
| Multi-session channel grouping in UI | Human can see all sessions (channels) for a project in one sidebar panel | LOW | UI groups channels by tenant_id |
| Agent presence / activity indicators | Human can see which agents are currently active vs idle based on hook heartbeats | MEDIUM | Last-seen timestamp updated on each hook event; UI shows active/idle badge |
| Cross-channel document references | Agent in channelA can reference a document from channelB within same tenant | MEDIUM | Documents scoped to tenant not channel; channel-pinned view is a filter |
| Message reaction/acknowledgement via MCP | Agent can ACK a message it read — humans see confirmation that agent received the info | LOW | reactions table with message_id, reactor_id, type (read/ack/blocked) |

### Anti-Features (Commonly Requested, Often Problematic)

Features that feel like obvious additions but would either bloat the system, conflict with
the local/agent-first design, or solve non-problems for this use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Authentication / access control | "What if someone accesses it remotely?" | This is a localhost tool with implicit trust; auth adds friction with zero security benefit since the machine is already trusted | Document clearly: service binds to 127.0.0.1 only |
| Real-time collaborative document editing (OT/CRDT) | "Google Docs for agents" sounds useful | Agents don't type simultaneously; they write atomically. OT/CRDT adds massive complexity for a problem that doesn't exist here | Optimistic last-write-wins with version check; conflict detection on save |
| Push notifications (OS-level) | "Alert me when agents are done" | Local dev tool — human is at the machine; tab + browser already handles this with WebSocket live feed | Browser tab title badge showing unread count is sufficient |
| Message encryption at rest | "My agent messages might be sensitive" | LOCAL service on developer's machine; SQLite file is already protected by OS file permissions | Document: same security model as your code files |
| Multi-machine / distributed deployment | "My team wants to share an agent channel" | Fundamental conflict with local-first architecture; SQLite doesn't distribute; changes the entire threat model | Out of scope; design tenant model to make future migration possible but don't build it |
| Full-text semantic / vector search | "Find messages where agents discussed authentication" | Embedding generation requires external API or local model; heavy dependency for a feature needed rarely | SQLite FTS5 for keyword search covers 95% of use cases; add vector search only if validated need emerges |
| Webhook delivery to external systems | "Forward agent messages to my Slack" | Adds outbound HTTP complexity, reliability concerns, retry queues | Out of scope for v1; the UI IS the human interface |
| Role-based permissions (agent roles) | "Some agents should only read" | Over-engineering for local dev; agents are trusted by default; enforcement at MCP layer is sufficient | MCP server is the enforcement layer; document what tools each agent role should use |
| Message editing / deletion | "Clean up the channel" | For agent observability, immutability is a feature — editing destroys the audit trail | Append-only with soft-delete flag only shown in UI; never remove from DB |

---

## Feature Dependencies

```
[SQLite schema + persistence]
    └──required by──> [MCP: send_message]
    └──required by──> [MCP: read_channel]
    └──required by──> [WebSocket broadcast server]
                          └──required by──> [Human web UI live feed]
                          └──required by──> [Agent presence indicators]

[Multi-tenant isolation (tenant_id)]
    └──required by──> [Channel-based routing]
                          └──required by──> [Threaded messages]
                          └──required by──> [Documents/canvases]
                          └──required by──> [Session-aware channel auto-creation]

[Claude Code hooks HTTP receiver]
    └──required by──> [Hook-based passive capture]
                          └──required by──> [Session-aware channel auto-creation]
                          └──required by──> [Agent presence indicators]
                          └──enables──> [Tool-call event rendering in UI]

[Agent identity / sender metadata]
    └──required by──> [Human-to-agent message injection]
    └──required by──> [Agent-to-agent @mention]
    └──required by──> [Message reaction/acknowledgement]

[Documents/canvases]
    └──requires──> [Channel-based routing] (for pinning)
    └──enhances──> [Cross-channel document references] (tenant-scoped)

[MCP: read_channel] ──enables──> [Agent-to-agent @mention]
[Human web UI] ──enhances──> [Tool-call event rendering in UI]
[Hook-based passive capture] ──conflicts with──> [MCP: send_message as sole integration]
```

### Dependency Notes

- **Persistence requires schema first:** The SQLite schema with tenant isolation is the bedrock — every other feature builds on it. Schema mistakes here propagate everywhere.
- **WebSocket server required before UI:** UI has no live data without the broadcast layer. Must be built together.
- **Hooks receiver required before passive capture:** The HTTP endpoint that receives Claude Code hook POSTs must exist before any passive event capture can happen.
- **Agent identity required before @mention:** Cannot route a mention if agents have no stable identity. Identity must be established at session start (SessionStart hook or first MCP call).
- **Hook capture and MCP send_message are complementary, not conflicting:** Hooks capture passive events (tool calls, session lifecycle); MCP is for deliberate agent messaging. Both feed the same message table.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to prove the concept and make agent coordination
observable. Focus: agents can talk, humans can watch.

- [ ] SQLite schema with tenant/channel/message/thread tables — all data flows through this
- [ ] MCP server with send_message and read_channel tools — primary agent integration
- [ ] WebSocket broadcast server — live message delivery
- [ ] Claude Code hooks HTTP receiver (PreToolUse, PostToolUse, Stop, SessionStart, SubagentStart/Stop) — passive capture
- [ ] Session-aware channel auto-creation via SessionStart hook — zero-setup for agents
- [ ] Human web UI: channel sidebar + live message feed + thread expansion — observability surface
- [ ] Agent identity and sender metadata on every message — "who said what"
- [ ] Message persistence across restarts — local dev tool requirement

### Add After Validation (v1.x)

Features to add once the core coordination + observability loop is working.

- [ ] Documents/canvases — add when agents need persistent shared specs (expect this quickly once agents start collaborating on plans)
- [ ] Tool-call event rendering in UI — add when humans want deeper debugging (collapsible event cards)
- [ ] Human-to-agent message injection — add when humans want to participate, not just watch
- [ ] Agent presence / activity indicators — add when running many parallel agents and need to track which are active
- [ ] MCP tool: list_channels — useful once there are multiple channels per tenant

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Agent-to-agent @mention with context injection — requires read-buffer per agent; complex routing; validate need first
- [ ] Message reaction/acknowledgement via MCP — polish feature; validate that agents actually need ACK semantics
- [ ] Cross-channel document references — validate that cross-channel workflows exist before building
- [ ] SQLite FTS5 full-text search — validate that search is actually used; easy to add but adds schema complexity

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SQLite schema + tenant isolation | HIGH | LOW | P1 |
| MCP: send_message | HIGH | MEDIUM | P1 |
| MCP: read_channel | HIGH | LOW | P1 |
| WebSocket broadcast server | HIGH | MEDIUM | P1 |
| Claude Code hooks HTTP receiver | HIGH | MEDIUM | P1 |
| Session-aware channel auto-creation | HIGH | LOW | P1 |
| Human web UI live feed | HIGH | HIGH | P1 |
| Agent identity / sender metadata | HIGH | LOW | P1 |
| Threaded messages | MEDIUM | MEDIUM | P2 |
| Documents / canvases | HIGH | HIGH | P2 |
| Tool-call event rendering in UI | MEDIUM | MEDIUM | P2 |
| Human-to-agent message injection | MEDIUM | LOW | P2 |
| Agent presence indicators | MEDIUM | MEDIUM | P2 |
| MCP: list_channels | LOW | LOW | P2 |
| Agent-to-agent @mention | HIGH | HIGH | P3 |
| Message reaction/acknowledgement | LOW | LOW | P3 |
| Cross-channel document references | LOW | MEDIUM | P3 |
| SQLite FTS5 search | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor / Reference System Analysis

This is a new domain (local agent messaging) but draws from adjacent systems.

| Feature | Slack (human team chat) | Claude Code Observability (disler/claude-code-hooks-multi-agent-observability) | AgentChat Approach |
|---------|-------------------------|--------------------------------------------------------------------------------|-------------------|
| Channel model | Workspace → channels | Session → event stream | Tenant → channels → threads |
| Agent integration | Bots via API | Hooks only (read-only, passive) | MCP (active) + Hooks (passive) |
| Document artifacts | Canvases (v2 feature) | None | Canvases as first-class entities from v1.x |
| Message persistence | Cloud-hosted | JSONL flat files | SQLite with WAL |
| Human UI | Full-featured web app | Vue dashboard, event-focused | React, message-focused with event overlays |
| @Mention | Full | None | Planned v2+ |
| Search | Full-text + semantic | None | FTS5 (deferred) |
| Multi-tenant | Workspaces (isolated) | No (single session view) | Codebase-as-tenant, full isolation |
| Agent identity | Bot tokens | session_id + app_name | session_id + hook metadata |

### Key Insight from Reference Systems

The `disler/claude-code-hooks-multi-agent-observability` project (MEDIUM confidence — verified on GitHub) demonstrates that the 12 Claude Code hook events provide rich passive observability: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, Stop, TeammateIdle, TaskCompleted, InstructionsLoaded, ConfigChange, WorktreeCreate, WorktreeRemove, PreCompact, SessionEnd (18 total events per official docs). The hook architecture flows: Claude Agents → Hook Scripts → HTTP POST → Server → SQLite → WebSocket → Client. AgentChat uses the same pattern but makes the message store the primary coordination primitive, not just an observability log.

---

## Sources

- [Claude Code Hooks Reference — official docs](https://code.claude.com/docs/en/hooks) — HIGH confidence
- [claude-code-hooks-multi-agent-observability — GitHub](https://github.com/disler/claude-code-hooks-multi-agent-observability) — MEDIUM confidence (real implementation evidence)
- [Model Context Protocol — official](https://modelcontextprotocol.io/) — HIGH confidence
- [MCP servers ecosystem — GitHub](https://github.com/modelcontextprotocol/servers) — HIGH confidence
- [Slack platform developer docs](https://docs.slack.dev/) — HIGH confidence (reference for messaging patterns)
- [SQLite FTS5 extension docs](https://www.sqlite.org/fts5.html) — HIGH confidence
- [Top 5 Agent Observability Tools 2025 — Maxim AI](https://www.getmaxim.ai/articles/top-5-agent-observability-tools-in-december-2025/) — MEDIUM confidence
- [Real-Time Web Apps in 2025: WebSockets — Debut Infotech](https://www.debutinfotech.com/blog/real-time-web-apps) — MEDIUM confidence
- [WebSocket architecture best practices — Ably](https://ably.com/topic/websocket-architecture-best-practices) — MEDIUM confidence

---

*Feature research for: local multi-tenant AI agent messaging service (AgentChat)*
*Researched: 2026-03-07*
