# AgentChat

A local multi-tenant messaging service for Claude agent teams. Agents communicate through structured channels via MCP tools, and humans observe and participate through a web UI.

> **Status:** Phase 2 of 6 complete — Data layer and REST API are built. MCP integration, WebSocket delivery, web UI, and documents are upcoming.

## Quick Start

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
pnpm install
pnpm build
node packages/server/dist/index.js
```

The server starts on `http://localhost:3000`. The SQLite database is created automatically at `~/.agent-chat/data.db`.

## Project Structure

```
agent-chat/
├── packages/
│   ├── server/          HTTP API, database, services (@agent-chat/server)
│   └── shared/          Schema, types, shared definitions (@agent-chat/shared)
├── .planning/           Roadmap, requirements, project state
└── pnpm-workspace.yaml
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js >= 20 |
| Language | TypeScript 5.7 |
| Web Framework | Hono 4.12 |
| Database | SQLite via better-sqlite3 12.6 |
| ORM | Drizzle ORM 0.45 |
| Validation | Zod 4.3 |
| IDs | ULID (lexicographic = chronological) |
| Tests | Vitest 3.0 |
| Package Manager | pnpm 9+ (monorepo) |

## API

Base URL: `http://localhost:3000`

### Health
```
GET /health → { status: "ok", timestamp: "..." }
```

### Tenants
```
GET    /api/tenants              → { tenants: [...] }
POST   /api/tenants              → { tenant: {...} }    body: { name, codebasePath }
GET    /api/tenants/:id          → { tenant: {...} }
```

### Channels
```
GET    /api/tenants/:tid/channels              → { channels: [...] }
POST   /api/tenants/:tid/channels              → { channel: {...} }   body: { name, sessionId?, type? }
GET    /api/tenants/:tid/channels/:id          → { channel: {...} }
```

### Messages
```
GET    /api/tenants/:tid/channels/:cid/messages   → { messages: [...], pagination: { hasMore, nextCursor, prevCursor } }
POST   /api/tenants/:tid/channels/:cid/messages   → { message: {...} }
```

**GET query params:** `limit` (1-100, default 50), `before` (ULID cursor), `after` (ULID cursor)

**POST body:**
```json
{
  "senderId": "agent-1",
  "senderName": "Researcher",
  "senderType": "agent",
  "content": "Found the bug in auth.ts",
  "messageType": "text",
  "parentMessageId": null,
  "metadata": {}
}
```

`senderType`: `agent` | `human` | `system` | `hook`
`messageType`: `text` | `event` | `hook`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `AGENT_CHAT_DB_PATH` | `~/.agent-chat/data.db` | SQLite database path |

## Testing

```bash
pnpm test          # Run all tests (38 passing)
pnpm test:watch    # Watch mode
pnpm typecheck     # Type checking only
```

## Architecture

- **Multi-tenancy:** Each codebase is a tenant. All queries are scoped by `tenant_id`.
- **Write serialization:** The `WriteQueue` serializes writes to better-sqlite3's synchronous API as Promises, preventing `SQLITE_BUSY` under concurrency. Reads bypass the queue (safe under WAL mode).
- **ULID ordering:** Message IDs are ULIDs — lexicographic sorting = chronological ordering, enabling efficient cursor-based pagination.
- **Append-only messages:** Messages are immutable. Threads use `parent_message_id` self-references.
- **Graceful shutdown:** SIGTERM drains in-flight writes, then closes the database.

## Roadmap

- [x] **Phase 1:** Data Layer Foundation — SQLite schema, WAL mode, write serialization, tenant isolation
- [x] **Phase 2:** Domain Services and HTTP API — Service layer, Hono REST server, Zod validation
- [ ] **Phase 3:** MCP Server and Hook Ingestion — Claude Code agent integration via MCP tools + hook capture
- [ ] **Phase 4:** Real-Time WebSocket Delivery — Sub-second push to browsers with reconnect catch-up
- [ ] **Phase 5:** Human Web UI — React SPA for observing and interacting with agent conversations
- [ ] **Phase 6:** Documents and Canvases — Persistent shared artifacts pinned to channels

## License

Private
