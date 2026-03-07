# Project Research Summary

**Project:** AgentChat — Local Multi-Tenant AI Agent Messaging Service
**Domain:** Real-time agent coordination and observability platform (local, developer tool)
**Researched:** 2026-03-07
**Confidence:** HIGH

## Executive Summary

AgentChat is a local developer tool that provides Slack-like messaging infrastructure for Claude Code AI agent teams. The product serves two distinct integration paths simultaneously: agents interact via MCP tools (active, deliberate messaging) and Claude Code lifecycle events passively flow in via HTTP hook ingestion. Humans observe everything through a React web UI with real-time WebSocket delivery. Expert implementations of this class of tool use a dual-process architecture — a stdio MCP subprocess per agent session and a shared HTTP/WebSocket server — with SQLite as the single source of truth for all state.

The recommended approach is a flat TypeScript monorepo using Hono (HTTP + WebSocket), `@modelcontextprotocol/sdk` v1.27.x (stdio transport, not SSE), `better-sqlite3` with Drizzle ORM, and a React + Vite + TanStack frontend. The architectural discipline that matters most is strict layer separation: domain services with no I/O dependencies, all SQL confined to a typed query layer, and tenant ID propagated explicitly through every call chain. An in-process Node.js `EventEmitter` replaces Redis as the pub/sub bus — correct and sufficient for a single-machine tool serving 2–50 concurrent agents.

The top risks are: (1) any `console.log()` in the MCP server corrupts the stdio JSON-RPC stream and is immediately fatal; (2) SQLite write contention under concurrent agents requires WAL mode plus an application-level write serialization queue from day one; (3) agent self-message loops can fill the database in seconds without sender-ID filtering in `read_channel`. All three risks must be eliminated in the foundation phase before any feature work begins — retrofitting them is expensive and introduces data integrity issues.

---

## Key Findings

### Recommended Stack

The stack is anchored by Hono 4.12.x as the HTTP and WebSocket server, chosen for its native TypeScript ergonomics, 3x performance advantage over Express, and official `@hono/node-ws` adapter. The MCP server runs on `@modelcontextprotocol/sdk` v1.27.x using stdio transport — **v2 is pre-alpha and must not be used**. SQLite via `better-sqlite3` 12.4.x is the persistence layer; its synchronous API is a feature for this use case, not a limitation. Drizzle ORM 0.45.x provides TypeScript-native schema definitions and typed queries without a Rust binary. Zod 4.x is required as a peer dependency of the MCP SDK and serves double duty as the schema validation layer for all message payloads. The frontend is React 19 + Vite 6 + TanStack Query/Router with Tailwind CSS v4 and shadcn/ui components.

**Core technologies:**
- **Hono 4.12.x + @hono/node-server**: HTTP + WebSocket on one port, TypeScript-native, official MCP adapter compatibility
- **@modelcontextprotocol/sdk v1.27.x**: MCP stdio transport for agent tool calls — production-stable v1 only, v2 pre-alpha excluded
- **better-sqlite3 12.4.x + Drizzle ORM 0.45.x**: Synchronous SQLite access with TypeScript schema inference, zero binary overhead
- **Zod 4.x**: Required SDK peer dependency; validates all MCP tool inputs and API payloads from one shared schema
- **React 19 + Vite 6 + TanStack Query/Router**: Standard 2026 SPA stack with type-safe routing and WebSocket-aware server state
- **react-use-websocket 4.x**: Handles reconnect state machines and message queuing in the browser, avoiding ~200 lines of error-prone boilerplate
- **tsx + tsup**: Dev execution and production bundling for the server without a compile step in development

### Expected Features

**Must have (table stakes — P1 for launch):**
- SQLite schema with full tenant/channel/message/thread tables — all data flows through this
- MCP tools: `send_message` and `read_channel` — primary agent integration surface
- WebSocket broadcast server with tenant+channel-scoped fan-out
- Claude Code hooks HTTP receiver for passive event capture (PreToolUse, PostToolUse, Stop, SessionStart, SubagentStart/Stop)
- Session-aware channel auto-creation via `SessionStart` hook — zero setup for agents
- Human web UI: channel sidebar + live message feed + thread expansion
- Agent identity and sender metadata on every message

**Should have (differentiators — P2, add after v1 validation):**
- Documents/canvases as persistent shared artifacts pinned to channels (versioned, agent-readable via MCP)
- Tool-call event rendering in UI (collapsible event cards from PostToolUse hooks)
- Human-to-agent message injection from the web UI
- Agent presence/activity indicators driven by hook heartbeats
- `list_channels` MCP tool

**Defer (v2+):**
- Agent-to-agent @mention with context injection (requires per-agent read-buffer routing)
- Message reaction/acknowledgement via MCP
- Cross-channel document references
- SQLite FTS5 full-text search (validate need before adding schema complexity)

**Anti-features to explicitly exclude:** Authentication (localhost implicit trust), OT/CRDT collaborative editing (agents write atomically, not simultaneously), OS push notifications, encryption at rest, multi-machine deployment, role-based agent permissions.

### Architecture Approach

The system follows a four-layer architecture: Client Layer (Web UI + MCP agents + hook scripts) → Server Layer (Hono WebSocket Hub + MCP Server + Hook Ingestion API) → Domain Layer (Message, Channel, Document services) → Persistence Layer (SQLite). The critical architectural invariant is that the MCP server process is stateless — it is a thin stdio subprocess per agent session that delegates all state operations to the shared HTTP server via localhost REST calls. The HTTP server plus SQLite is the sole source of truth. An in-process `EventEmitter` serves as the pub/sub bus: domain services emit after persisting to SQLite, and the WebSocket hub subscribes to broadcast to browser clients. No external pub/sub infrastructure (no Redis) is needed or appropriate for a single-machine tool.

**Major components:**
1. **MCP Server (stdio transport)** — thin per-session subprocess; registers tools that make HTTP calls to the core server; never holds state; never uses `console.log()`
2. **Hono HTTP + WebSocket Server** — single process; serves REST API, WebSocket hub, and hook ingestion endpoint; owns the `EventEmitter` bus
3. **Domain Services (Message / Channel / Document)** — pure TypeScript, no direct I/O imports; testable in isolation; emit events after DB writes
4. **SQLite Query Layer** — all SQL confined here; every query mandatorily includes `tenant_id` filter; `better-sqlite3` synchronous API
5. **WebSocket Hub** — holds `Map<tenantId+channelId, Set<WebSocket>>` for O(1) fan-out; implements cursor-based catch-up on reconnect
6. **React Web UI** — TanStack Query + `react-use-websocket`; loads last 50 messages on channel subscribe, then switches to WebSocket push

### Critical Pitfalls

1. **MCP stdout pollution** — Any `console.log()` in the MCP server corrupts the JSON-RPC stream silently. Establish `stderr`-only logging and an ESLint rule banning `console.log` in MCP files before writing any server code.

2. **SQLite write contention** — WAL mode alone does not prevent write/write collisions. Implement `busy_timeout=5000` plus an application-level async write serialization queue (e.g., `p-queue` concurrency 1) in the data layer foundation. Never ship without this.

3. **Agent self-message loops** — An agent that reads its own outgoing messages as new context will loop infinitely, filling the DB in seconds. The `read_channel` MCP tool must always filter out messages where `sender_id` matches the calling agent's session ID.

4. **Tenant isolation leakage** — Module-level tenant ID singletons cause cross-tenant data bleed under concurrent requests. Always pass `tenant_id` explicitly as a function parameter through the entire call chain; enforce at the query layer so it cannot be omitted.

5. **WebSocket reconnection without gap recovery** — Clients reconnecting after interruption silently miss messages. Implement cursor-based catch-up from day one: client sends `lastSeenMessageId` on reconnect; server pushes the gap before resuming live stream.

---

## Implications for Roadmap

The architecture research provides an explicit build-order dependency graph. The suggested phases map directly to it, with pitfall prevention integrated into each foundation phase.

### Phase 1: Data Layer Foundation

**Rationale:** Schema and query layer are the bedrock all other components depend on. Pitfall prevention (WAL mode, write queue, tenant isolation) must be embedded here — retrofitting is costly and creates data integrity risk. Nothing else can be built safely until this is locked.

**Delivers:** SQLite schema (tenants, channels, messages, threads), typed query functions, WAL mode + `busy_timeout` configuration, application-level write serialization queue, composite index on `(tenant_id, channel_id, id)`, verified tenant isolation in concurrent integration tests.

**Addresses:** Message persistence, multi-tenant isolation, threaded message storage (schema only)

**Avoids:** SQLite write contention (Pitfall 2), tenant isolation leakage (Pitfall 4), write-before-respond durability gap (Pitfall 7)

**Research flag:** Standard patterns — well-documented SQLite and Drizzle ORM patterns; skip `research-phase`.

---

### Phase 2: Domain Services and HTTP Server

**Rationale:** Domain services are testable without network code. REST API makes them accessible for integration tests before WebSocket or MCP complexity is introduced. This phase establishes the `EventEmitter` bus contract that WebSocket Hub and MCP Server both depend on.

**Delivers:** Message, Channel, and Document service classes (no I/O imports), Hono HTTP server with REST API (`/api/messages`, `/api/channels`, `/api/tenants`), `EventEmitter`-based pub/sub bus, tenant middleware extracting `tenant_id` from request context.

**Addresses:** Channel-based message routing, agent identity/sender metadata, human-to-agent message injection (HTTP path), session-aware channel auto-creation (service logic)

**Avoids:** Global tenant context variable (Pitfall 4 prevention enforced here at service layer)

**Research flag:** Standard patterns — REST API and service layer patterns are well-established; skip `research-phase`.

---

### Phase 3: MCP Server and Hook Ingestion

**Rationale:** MCP server and hook ingestion both depend on the HTTP server being live (Phase 2). They can be built in parallel. This phase is where agent integration becomes real — the MCP stdio transport is the primary agent coordination surface and must be validated with live Claude model calls before declaring done.

**Delivers:** MCP stdio server with `send_message` and `read_channel` tools, hook ingestion HTTP endpoint (`POST /hooks`), hook normalization to internal message format, agent self-message filter in `read_channel`, per-agent rate limiter circuit breaker, stderr-only logging enforced by ESLint rule.

**Addresses:** MCP tool integration (send_message, read_channel), passive hook capture (PreToolUse, PostToolUse, Stop, SessionStart, SubagentStart/Stop), session-aware channel auto-creation (triggered by SessionStart hook)

**Avoids:** MCP stdout pollution (Pitfall 1), agent self-message loop (Pitfall 3), over-broad tool schemas (Pitfall 6), premature ACK before DB write (Pitfall 7)

**Research flag:** Needs deeper research during planning — MCP stdio transport edge cases and hook event schema details are documented but integration-specific; run `research-phase` for hook-to-message normalization logic.

---

### Phase 4: WebSocket Hub and Real-Time Delivery

**Rationale:** WebSocket hub depends on the `EventEmitter` bus from Phase 2. It must be built and tested before the UI can show live data. The cursor-based reconnection catch-up is the most complex correctness requirement and must be designed here, not retrofitted later.

**Delivers:** WebSocket hub with `Map<tenantId+channelId, Set<WebSocket>>` connection registry, tenant+channel-scoped broadcast, cursor-based catch-up on reconnect (`lastSeenMessageId` protocol), WebSocket backpressure monitoring (`ws.bufferedAmount`), bounded in-memory event queue.

**Addresses:** Real-time message delivery (sub-second), agent presence indicators (connection state tracking)

**Avoids:** WebSocket reconnection without gap recovery (Pitfall 5), unbounded backpressure memory growth (Performance Trap 4), one-channel-per-connection anti-pattern

**Research flag:** Standard patterns — WebSocket hub and pub/sub patterns are well-documented; skip `research-phase`. The catch-up protocol is novel but straightforward given SQLite persistence.

---

### Phase 5: Human Web UI

**Rationale:** UI depends on both the REST API (Phase 2) and WebSocket hub (Phase 4). Building it last in the core sequence means it can be developed against a live backend rather than mocks — faster iteration and correct behavior from the start.

**Delivers:** React + Vite SPA with TanStack Router, channel sidebar (grouped by tenant), live message feed with agent/human visual differentiation, thread expansion panel, `react-use-websocket` with reconnect and cursor-based catch-up, initial 50-message history load on channel subscribe, loading state and error boundaries with TanStack Query.

**Addresses:** Human web UI live feed, threaded messages (UI rendering), agent identity display, message history on load

**Avoids:** UI appearing empty on load (always load last N messages), no visual distinction between agent and human messages (UX Pitfall 1), flat unreadable thread history (UX Pitfall 2)

**Research flag:** Standard patterns — React + TanStack + shadcn/ui patterns are well-documented; skip `research-phase`. WebSocket integration with `react-use-websocket` is straightforward.

---

### Phase 6: Documents and Canvases

**Rationale:** Documents are a v1.x differentiator — high value once the core coordination loop is working, but blocked on the full persistence + WebSocket + UI stack from phases 1-5. Adding documents after the core is validated prevents scope creep that delays agent usability.

**Delivers:** `documents` table with version tracking, Document service (create/update/read), `read_document` MCP tool, document pinning to channels, document viewer in React UI, live document sync via same `EventEmitter` → WebSocket path as messages.

**Addresses:** Documents/canvases as persistent artifacts, tool-call event rendering in UI (add collapsible event cards from PostToolUse data already captured in Phase 3)

**Avoids:** Document changes not reflected live in UI (UX Pitfall 4 — use same WebSocket broadcast path)

**Research flag:** Standard patterns for the storage and sync model; skip `research-phase`. Canvas/document UX patterns may benefit from lightweight research if agent collaboration workflows are unclear.

---

### Phase Ordering Rationale

- **Schema first:** Every feature depends on the data model. Tenant isolation bugs in the schema propagate to every query written after it — impossible to fix cheaply later.
- **Domain services before network:** Pure service classes are testable in isolation. Writing them before HTTP/WS code means the business logic is verified before integration complexity is introduced.
- **MCP and hooks before UI:** The UI should render real agent messages from day one, not stubbed data. Agents must be able to post before the human can observe.
- **WebSocket before UI:** The UI's primary value (live feed) requires the broadcast layer. Building the hub first means the UI can be developed against real WebSocket push, not polling.
- **Documents last in v1:** High value but not on the critical path for proving agent coordination. Deferring prevents scope creep without sacrificing correctness of what ships first.

### Research Flags

**Needs `research-phase` during planning:**
- **Phase 3 (MCP Server + Hook Ingestion):** Claude Code hook event schema has 18 distinct event types; normalization to internal message format requires careful research to avoid missing events or misclassifying them. Hook-to-message routing logic (which events create messages vs. which update presence) needs explicit design before implementation.

**Standard patterns — skip `research-phase`:**
- **Phase 1 (Data Layer):** SQLite WAL mode, Drizzle ORM schema, write queue with `p-queue` — all well-documented.
- **Phase 2 (Domain + HTTP):** Hono REST API, TypeScript service patterns, EventEmitter pub/sub — standard and well-documented.
- **Phase 4 (WebSocket Hub):** WebSocket connection registry, cursor-based catch-up — straightforward given the persistence layer exists.
- **Phase 5 (Web UI):** TanStack + shadcn/ui + react-use-websocket — mature, extensively documented ecosystem.
- **Phase 6 (Documents):** Append-only versioned document storage with WebSocket sync — applies same patterns as message layer.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies confirmed against npm latest versions as of 2026-03-07; MCP SDK v1/v2 split verified against official GitHub; Zod v4 peer dependency confirmed |
| Features | HIGH for core messaging; MEDIUM for agent-specific patterns | Hook event semantics and agent coordination patterns are an emerging domain; reference implementation (disler/claude-code-hooks-multi-agent-observability) provides MEDIUM-confidence evidence |
| Architecture | HIGH | MCP transport and hook integration patterns sourced from official Anthropic docs; messaging architecture patterns from well-established industry sources (Ably, Hathora, CometChat) |
| Pitfalls | HIGH | MCP stdout pollution, SQLite WAL limitations, and WebSocket reconnection gaps are all documented with authoritative sources; agent loop risk is well-established in agentic systems literature |

**Overall confidence:** HIGH

### Gaps to Address

- **MCP SDK v2 timeline:** Research confirms v2 is pre-alpha targeting Q1 2026 (which is now). Monitor the MCP TypeScript SDK GitHub for v2 stable release; if it releases before Phase 3, evaluate whether `@hono/node-ws` + official MCP Hono adapter changes the MCP server implementation. Do not block on this — v1 is production-stable.

- **Hook event normalization rules:** The 18 Claude Code hook event types need explicit mapping to internal message categories (e.g., which events create messages vs. update presence vs. are silently discarded). This mapping should be designed and documented before Phase 3 implementation begins. Recommend a lightweight `research-phase` focused specifically on this normalization logic.

- **Agent identity establishment:** The mechanism for stable agent identity (session ID from MCP tool args vs. hook `session_id` field) needs to be consistent across both integration paths. If an agent both calls MCP tools and emits hooks, its messages from both paths must share the same `sender_id`. This cross-path identity normalization should be explicitly designed before Phase 3.

- **MCP tool count vs. model confusion threshold:** Research flags that over-broad tools confuse models, but the optimal number and granularity of tools for Claude Code agent usage is not definitively documented. The Phase 3 research flag above covers this — validate tool schemas with live Claude model calls before shipping.

---

## Sources

### Primary (HIGH confidence)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — v1.27.1 stable confirmed; v2 pre-alpha status; Zod v4 peer dependency
- [Claude Code Hooks Reference — official docs](https://code.claude.com/docs/en/hooks) — 18 hook event types, hook configuration schema
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) — stdio transport, Claude Code agent integration
- [Model Context Protocol — official](https://modelcontextprotocol.io/) — tool definition patterns, transport options
- [SQLite WAL docs](https://sqlite.org/wal.html) — WAL mode behavior, write/write contention limits
- [Hono npm / docs](https://hono.dev) — v4.12.5 latest confirmed; @hono/node-ws requirement for Node.js

### Secondary (MEDIUM confidence)
- [claude-code-hooks-multi-agent-observability — GitHub](https://github.com/disler/claude-code-hooks-multi-agent-observability) — real implementation evidence for hook architecture
- [WebSocket Architecture Best Practices — Ably](https://ably.com/topic/websocket-architecture-best-practices) — pub/sub patterns, connection registry
- [Scalable WebSocket Architecture — Hathora](https://blog.hathora.dev/scalable-websocket-architecture/) — in-process pub/sub vs. external broker tradeoffs
- [Shared-Nothing SQLite Multi-Tenancy](https://intertwingly.net/blog/2025/11/04/Shared-Nothing-Multi-Tenancy.html) — row-level scoping patterns
- [SQLite Concurrent Writes — tenthousandmeters.com](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) — SQLITE_BUSY root causes and fixes
- [Agentic Resource Exhaustion — Medium](https://medium.com/@instatunnel/agentic-resource-exhaustion-the-infinite-loop-attack-of-the-ai-era-76a3f58c62e3) — agent loop attack patterns
- [How Slack Built Shared Channels — Slack Engineering](https://slack.engineering/how-slack-built-shared-channels/) — write-before-respond durability lesson
- [WebSocket Reconnection Logic — OneUptime](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view) — cursor-based catch-up patterns
- [Implementing MCP: Tips, Tricks and Pitfalls — Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — MCP stdout pollution documentation

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*
