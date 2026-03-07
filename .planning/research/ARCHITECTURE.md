# Architecture Research

**Domain:** Local multi-tenant agent messaging service with MCP integration
**Researched:** 2026-03-07
**Confidence:** HIGH (MCP transport/hooks from official docs; messaging patterns from well-established industry sources)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├────────────────────┬────────────────────┬────────────────────────────┤
│     Web UI         │    MCP Clients      │    Hook Scripts            │
│  (React + Vite)    │  (Claude Code       │  (Claude Code              │
│                    │   agents via MCP)   │   lifecycle events)        │
└────────┬───────────┴─────────┬──────────┴───────────┬────────────────┘
         │ WebSocket            │ stdio/HTTP MCP        │ HTTP POST
         │                      │                       │
┌────────▼──────────────────────▼───────────────────────▼────────────┐
│                        SERVER LAYER (Hono / Node.js)                │
├───────────────────┬───────────────────┬─────────────────────────────┤
│  WebSocket Hub    │   MCP Server       │   Hook Ingestion API        │
│  - Connection     │  - send_message    │  - HTTP POST endpoint       │
│    registry       │  - read_channel    │  - Parses hook JSON         │
│  - Tenant-scoped  │  - list_channels   │  - Converts to messages     │
│    broadcast      │  - create_thread   │                             │
│  - Heartbeat      │  - read_document   │                             │
└────────┬──────────┴────────┬──────────┴───────────────┬─────────────┘
         │                   │                           │
┌────────▼───────────────────▼───────────────────────────▼────────────┐
│                       CORE DOMAIN LAYER                              │
├──────────────────┬───────────────────┬──────────────────────────────┤
│  Message Service │  Channel Service  │   Document Service            │
│  - Create/read   │  - Tenant mgmt    │   - Create/update canvas      │
│  - Thread fan-   │  - Channel CRUD   │   - Version tracking          │
│    out           │  - Membership     │   - Channel attachment        │
│  - Persist       │                   │                               │
└────────┬─────────┴──────────┬────────┴──────────────────┬───────────┘
         │                    │                            │
┌────────▼────────────────────▼────────────────────────────▼──────────┐
│                       PERSISTENCE LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     SQLite (better-sqlite3)                   │    │
│  │  tenants | channels | messages | threads | documents | ...   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| Web UI | Human observability and interaction; renders channels, messages, threads, documents in real time | React + Vite, WebSocket client |
| WebSocket Hub | Manages persistent connections from browser clients; broadcasts new messages to all subscribers in a tenant+channel scope | `ws` library on Hono server |
| MCP Server | Exposes tools that agents call to send/read messages; runs as stdio transport for <5ms latency | `@modelcontextprotocol/sdk`, stdio transport |
| Hook Ingestion API | Receives POST requests from Claude Code hook scripts; captures passive agent activity (tool calls, session events) as messages | Hono HTTP route |
| Message Service | Core business logic for creating, persisting, and fanning out messages; triggers WebSocket broadcasts | TypeScript service class |
| Channel Service | Manages tenant and channel lifecycle; enforces tenant isolation; maps codebase path to tenant ID | TypeScript service class |
| Document Service | Manages persistent shared artifacts (canvases/documents) pinned to channels | TypeScript service class |
| SQLite DB | Durable persistence across restarts; single embedded file, no external process required | `better-sqlite3` (synchronous API, simplest integration with Node.js) |

## Recommended Project Structure

```
src/
├── server/                   # Hono HTTP + WebSocket server
│   ├── index.ts              # Entry point; binds all routers
│   ├── websocket.ts          # WebSocket hub, connection registry
│   ├── routes/
│   │   ├── mcp.ts            # MCP server mount (stdio transport)
│   │   └── hooks.ts          # Hook ingestion HTTP endpoint
│   └── middleware/
│       └── tenant.ts         # Extract tenant ID from request context
│
├── mcp/                      # MCP tool definitions
│   ├── server.ts             # McpServer instantiation + tool registration
│   └── tools/
│       ├── send-message.ts
│       ├── read-channel.ts
│       ├── list-channels.ts
│       ├── create-thread.ts
│       └── read-document.ts
│
├── domain/                   # Core business logic, no I/O dependencies
│   ├── messages.ts           # Message create, read, fan-out trigger
│   ├── channels.ts           # Channel and tenant lifecycle
│   ├── threads.ts            # Thread creation and reply logic
│   └── documents.ts          # Document create, update, read
│
├── db/                       # SQLite access layer
│   ├── client.ts             # better-sqlite3 singleton
│   ├── schema.ts             # Table definitions (CREATE TABLE IF NOT EXISTS)
│   ├── migrations/           # Sequential migration files
│   └── queries/              # Typed query functions per entity
│       ├── messages.ts
│       ├── channels.ts
│       └── documents.ts
│
├── broadcast/                # WebSocket broadcast coordination
│   └── hub.ts                # In-memory connection registry, fan-out logic
│
└── client/                   # React web UI (Vite build target)
    ├── App.tsx
    ├── components/
    │   ├── ChannelList.tsx
    │   ├── MessageFeed.tsx
    │   ├── ThreadPanel.tsx
    │   └── DocumentViewer.tsx
    └── hooks/
        └── useWebSocket.ts   # Reconnecting WebSocket, message subscription
```

### Structure Rationale

- **server/:** Network boundary — HTTP, WebSocket, MCP transport all here. Nothing in `domain/` imports from here.
- **mcp/:** Tool definitions separate from HTTP routes — each tool is a thin adapter that calls `domain/`.
- **domain/:** Pure business logic. No direct imports of `ws`, `better-sqlite3`, or HTTP primitives. Testable in isolation.
- **db/:** All SQL confined here. Domain layer calls query functions, never writes SQL directly.
- **broadcast/:** Extracted because it's shared between WebSocket hub (push to browsers) and potentially MCP (future server-sent events). Keeps message fan-out logic in one place.

## Architectural Patterns

### Pattern 1: In-Process Pub/Sub (Event Emitter as Message Bus)

**What:** A Node.js `EventEmitter` (or a typed wrapper) acts as the internal message bus. When a message is persisted, the domain layer emits an event. The WebSocket hub subscribes and broadcasts to connected clients.

**When to use:** Single-process local service with no clustering requirement. Eliminates external pub/sub infrastructure (no Redis required).

**Trade-offs:** Simple and fast; breaks only if you need multiple Node.js processes. For a localhost tool, this is the right call.

**Example:**
```typescript
// broadcast/hub.ts
import { EventEmitter } from 'events';

const bus = new EventEmitter();

// domain/messages.ts calls this after persisting
export function publishMessage(tenantId: string, channelId: string, message: Message) {
  bus.emit(`channel:${tenantId}:${channelId}`, message);
}

// websocket.ts subscribes per connection
bus.on(`channel:${tenantId}:${channelId}`, (msg) => {
  ws.send(JSON.stringify(msg));
});
```

### Pattern 2: Tenant Isolation via Row-Level Scoping

**What:** All queries include a `tenant_id` column filter derived from the codebase path. A single SQLite database file serves all tenants. Every table has `tenant_id` as the first column and a composite unique constraint where needed.

**When to use:** Local service where a separate DB-per-tenant file (the alternative) adds file management complexity without meaningful isolation benefit.

**Trade-offs:** Simpler file management; relies on query-layer discipline. For a trusted local service with TypeScript-enforced query functions, this is acceptable. A DB-per-tenant approach is better for strict isolation in multi-user cloud deployments, which is out of scope here.

**Example:**
```typescript
// db/queries/messages.ts
export function getChannelMessages(
  tenantId: string,
  channelId: string,
  limit = 50
): Message[] {
  return db.prepare(
    `SELECT * FROM messages
     WHERE tenant_id = ? AND channel_id = ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(tenantId, channelId, limit) as Message[];
}
```

### Pattern 3: MCP stdio Transport (Agent Integration)

**What:** The MCP server runs as a subprocess of each Claude Code agent instance via stdio transport. The agent spawns the MCP server process; all tool calls go through stdin/stdout JSON-RPC. The MCP server process makes HTTP calls to the main AgentChat server to persist and broadcast messages.

**When to use:** Local agent integration. stdio gives <5ms latency and requires no auth setup. Each Claude Code session gets its own MCP process.

**Trade-offs:** MCP process is a thin client — it delegates all state to the HTTP server. The HTTP server is the single source of truth. This avoids state divergence between MCP processes and the web UI.

**Example:**
```typescript
// mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'agentchat', version: '1.0.0' });

server.tool('send_message', { ... }, async (args) => {
  const response = await fetch('http://localhost:PORT/api/messages', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return { content: [{ type: 'text', text: 'Message sent' }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 4: Hook Ingestion via HTTP POST

**What:** Claude Code hooks post a JSON payload to the AgentChat server at a known local port. A hook script (shell or Node.js) is registered in `.claude/settings.json` for events like `Stop`, `SubagentStop`, or `UserPromptSubmit`. The script reads the hook JSON from stdin and forwards it to the ingestion endpoint.

**When to use:** Passive message capture — when agents are NOT actively using MCP tools but activity should still be visible in the UI (e.g., session completion, agent idle events).

**Trade-offs:** Hook scripts have no return value that affects messaging (fire-and-forget). Agents must have the hook scripts registered in their project settings. This is a secondary integration path to MCP, not the primary one.

**Example:**
```bash
# .claude/hooks/agentchat-capture.sh
#!/bin/bash
# Reads hook JSON from stdin, posts to AgentChat
cat | curl -s -X POST http://localhost:3210/hooks \
  -H 'Content-Type: application/json' \
  --data-binary @- > /dev/null
```

## Data Flow

### Agent Sends a Message (Active Path via MCP)

```
Claude Code Agent
    │
    │  Tool call: send_message(tenant, channel, text)
    ▼
MCP Server process (stdio)
    │
    │  HTTP POST /api/messages
    ▼
Hono Server → Message Service
    │               │
    │               ├─► db/queries/messages → SQLite (persist)
    │               │
    │               └─► broadcast/hub → EventEmitter → emit channel event
    │
    ▼
WebSocket Hub (subscribed to EventEmitter)
    │
    │  ws.send(JSON) to all connected clients in tenant+channel scope
    ▼
Web UI (React)
    │
    └─► MessageFeed re-renders with new message
```

### Human Sends a Message (Web UI Path)

```
Human types in Web UI
    │
    │  HTTP POST /api/messages (or WebSocket message)
    ▼
Hono Server → Message Service
    │  (identical path as above — same persistence + broadcast)
    ▼
All connected subscribers notified (including the sender's own UI)
```

### Passive Capture (Hook Path)

```
Claude Code event fires (e.g., Stop, SubagentStop)
    │
    │  Hook script reads stdin JSON
    ▼
Hook script → HTTP POST /hooks
    │
    ▼
Hook Ingestion API → normalizes to message format
    │
    ▼
Message Service → (same persist + broadcast path as above)
```

### Web UI Initial Load

```
Browser opens Web UI
    │
    ├─► GET /api/tenants → list available tenants
    ├─► GET /api/channels?tenantId=X → list channels
    ├─► GET /api/messages?channelId=Y → fetch last N messages
    │
    └─► WebSocket connect → hub registers connection for tenant+channel
        │
        └─► All future messages arrive via WebSocket push (no polling)
```

### Key Data Flows Summary

1. **Message write path:** MCP tool / Web UI / Hook → Message Service → SQLite (persist) → EventEmitter (fan-out) → WebSocket Hub → Browser
2. **Message read path (history):** Web UI → REST GET → SQLite query → JSON response
3. **Tenant context propagation:** Codebase path (from MCP tool arg or hook JSON) → normalize to `tenant_id` string → included in all DB queries

## Scaling Considerations

This is a local single-machine tool. Scale is measured in concurrent Claude Code sessions, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 agents, 1 human | Monolith is correct. EventEmitter pub/sub. Single SQLite file. |
| 10-50 agents simultaneously | Same architecture. SQLite handles thousands of writes/sec. WebSocket hub manages ~50 connections trivially. |
| 50+ agent sessions | Not the design target. If needed: connection pooling, WAL mode for SQLite, consider Turso/libsql for concurrent writers. |

### Scaling Priorities (if needed)

1. **First bottleneck:** SQLite write contention under heavy concurrent agent activity. Fix: enable WAL mode (`PRAGMA journal_mode=WAL`), which allows concurrent reads while a write is in progress. Already planned in STACK.md.
2. **Second bottleneck:** WebSocket fan-out to many browser tabs. Fix: deduplicate subscriptions per channel, add server-sent events as alternative.

## Anti-Patterns

### Anti-Pattern 1: Agents Reading Messages via Polling

**What people do:** Agents call `read_channel` in a loop to check for new messages.
**Why it's wrong:** Wastes LLM context window on tool calls; creates noisy message history; burns token budget.
**Do this instead:** Design agents to read on-demand (before acting) rather than continuously. If push notification to agents is required, use MCP "resources" with change subscriptions (MCP 2025-03-26 spec supports resource subscriptions).

### Anti-Pattern 2: Storing Tenant Context in MCP Process State

**What people do:** The MCP server process maintains its own in-memory copy of channels and messages, syncing with the main server.
**Why it's wrong:** Creates two sources of truth. If the MCP process crashes or reconnects, state diverges from what the web UI shows.
**Do this instead:** MCP process is stateless. Every tool call reads from and writes to the HTTP server. The HTTP server + SQLite is the single source of truth.

### Anti-Pattern 3: WebSocket Messages as the Persistence Layer

**What people do:** Only broadcast via WebSocket; assume clients reconstruct history from the stream.
**Why it's wrong:** Clients joining mid-conversation see no history. Disconnected agents miss messages entirely.
**Do this instead:** Always persist to SQLite first, then broadcast. On WebSocket connect, load the last N messages from DB as the baseline.

### Anti-Pattern 4: One Channel = One WebSocket Connection

**What people do:** Open a new WebSocket connection per channel subscription.
**Why it's wrong:** Browser has connection limits; unnecessary overhead for a single-page app with multiple channels.
**Do this instead:** Multiplex all subscriptions over one WebSocket connection. Client sends `{type: "subscribe", channelId: "..."}` messages. Server routes broadcasts based on subscription state per connection.

### Anti-Pattern 5: Global SQLite Without Tenant Filtering

**What people do:** Query `SELECT * FROM messages WHERE channel_id = ?` without a tenant filter.
**Why it's wrong:** Channel IDs may collide across tenants (e.g., "general" exists in every tenant). Returns data leak across codebases.
**Do this instead:** Every query includes `AND tenant_id = ?`. Enforce this in the query function layer so it cannot be accidentally omitted.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code (agent) | MCP stdio transport — Claude Code spawns the MCP server subprocess | Each agent session spawns its own MCP process; all are thin clients to the main HTTP server |
| Claude Code (hooks) | HTTP POST to `/hooks` endpoint from shell hook scripts | Hook scripts are registered per-project in `.claude/settings.json`; fire on lifecycle events |
| Web Browser | WebSocket for push; REST for history and CRUD | Single multiplexed WebSocket connection per browser tab |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP Server ↔ Core Server | HTTP REST (localhost) | MCP process treats the core server as an API; no shared memory |
| Hook Ingestion ↔ Message Service | Direct function call (same process) | Hook ingestion normalizes to internal message format before calling domain layer |
| Message Service ↔ Broadcast Hub | EventEmitter (same process) | Domain layer emits; hub subscribes; no coupling in return direction |
| Broadcast Hub ↔ WebSocket connections | `ws.send()` per registered connection | Hub holds a `Map<tenantId+channelId, Set<WebSocket>>` for O(1) fan-out |
| Domain Layer ↔ SQLite | Synchronous `better-sqlite3` calls via typed query functions | Synchronous API works well with Node.js event loop for local embedded DB |

## Build Order (Phase Dependencies)

```
1. SQLite schema + query layer
       │
       │  (no dependencies; foundational data contracts)
       ▼
2. Domain services (Message, Channel, Thread, Document)
       │
       │  (depends on query layer)
       ▼
3. HTTP server + REST API (Hono)
       │
       │  (depends on domain services)
       ├──────────────────────────────────────┐
       ▼                                      ▼
4a. WebSocket Hub                        4b. MCP Server
    (depends on HTTP server               (depends on HTTP server
     + domain EventEmitter)                REST API)
       │                                      │
       ▼                                      ▼
5a. Web UI (React + Vite)              5b. Hook Ingestion API
    (depends on WebSocket Hub              (depends on HTTP server)
     + REST API)
       │
       ▼
6. Hook scripts + Claude Code integration
   (depends on Hook Ingestion API + MCP Server running)
```

**Rationale for this order:**
- Schema first establishes the data contracts everything else depends on.
- Domain services are testable before any network code exists.
- REST API makes domain services accessible for integration tests.
- WebSocket Hub and MCP Server can be built in parallel (both depend only on the HTTP server).
- Web UI comes after WebSocket Hub because the live-streaming experience is the primary UI value.
- Hook integration is last because it requires the full server to be running and requires writing hook scripts for each agent codebase.

## Sources

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Official transport options and tool definition patterns (HIGH confidence)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) — Stdio transport latency, Claude Code integration patterns (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — Full hook event schema, hook configuration, MCP tool matching patterns (HIGH confidence)
- [MCP Transport Guide](https://dev.to/zrcic/understanding-mcp-server-transports-stdio-sse-and-http-streamable-5b1p) — Stdio vs SSE vs HTTP Streamable comparison (MEDIUM confidence)
- [WebSocket Architecture Best Practices — Ably](https://ably.com/topic/websocket-architecture-best-practices) — Pub/sub patterns, connection registry, backpressure (MEDIUM confidence)
- [Shared-Nothing SQLite Multi-Tenancy](https://intertwingly.net/blog/2025/11/04/Shared-Nothing-Multi-Tenancy.html) — SQLite per-tenant and row-level scoping patterns (MEDIUM confidence)
- [Scalable WebSocket Architecture — Hathora](https://blog.hathora.dev/scalable-websocket-architecture/) — In-process pub/sub vs external broker tradeoffs (MEDIUM confidence)
- [Chat Application Architecture — CometChat](https://www.cometchat.com/blog/chat-application-architecture-and-system-design) — Component breakdown for messaging systems (MEDIUM confidence)

---
*Architecture research for: Local multi-tenant agent messaging service (AgentChat)*
*Researched: 2026-03-07*
