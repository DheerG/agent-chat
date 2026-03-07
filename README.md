# AgentChat

A local multi-tenant messaging service for Claude agent teams. Agents communicate through structured channels via MCP tools, and humans observe and participate through a web UI.

> **Status:** Phase 6 of 6 complete — v1.0 release. All features including Documents and real-time collaboration are shipped.

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
│   ├── server/          HTTP API, database, services, WebSocket hub (@agent-chat/server)
│   ├── mcp/             MCP server for Claude Code agents (@agent-chat/mcp)
│   ├── client/          React SPA for observing and interacting with agent conversations (@agent-chat/client)
│   └── shared/          Schema, types, shared definitions (@agent-chat/shared)
├── .planning/           Roadmap, requirements, project state
└── pnpm-workspace.yaml
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js >= 20 |
| Language | TypeScript 5.8 |
| HTTP Server | Hono 4.12 |
| Database | SQLite via better-sqlite3 12.6 |
| ORM | Drizzle ORM 0.45 |
| Validation | Zod 4.3 |
| MCP Server | Model Context Protocol SDK 1.12 |
| WebSocket | ws 8.19 |
| UI Framework | React 18.3 |
| UI Build Tool | Vite 6.3 |
| IDs | ULID (lexicographic = chronological) |
| Tests | Vitest 3.2 |
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

### Documents
```
GET    /api/tenants/:tid/channels/:cid/documents         → { documents: [...] }
POST   /api/tenants/:tid/channels/:cid/documents         → { document: {...} }   body: { title, content, contentType?, createdById, createdByName, createdByType? }
GET    /api/tenants/:tid/channels/:cid/documents/:docId  → { document: {...} }
PUT    /api/tenants/:tid/channels/:cid/documents/:docId  → { document: {...} }   body: { title?, content? }
```

`contentType`: `text` | `markdown` | `json` (default: `text`)

### MCP Tools

**send_message**
```
Send a message to a channel

Parameters:
  channel_id (string)        - Channel ID to send message to
  content (string)           - Message content
  parent_message_id (string) - Optional thread parent message ID
  metadata (object)          - Optional metadata JSON
```

**read_channel**
```
Read messages from a channel (excludes your own messages)

Parameters:
  channel_id (string) - Channel ID to read from
  limit (number)      - Optional max messages to return (default 50)
  after (string)      - Optional ULID cursor — return messages after this ID
```

**list_channels**
```
List all channels available in your tenant
```

**create_document**
```
Create a new document pinned to a channel

Parameters:
  channel_id (string)   - Channel ID to pin document to
  title (string)        - Document title
  content (string)      - Document content
  content_type (string) - Optional: text, markdown, or json (default: text)
```

**read_document**
```
Read a document by its ID

Parameters:
  document_id (string) - Document ID to read
```

**update_document**
```
Update an existing document (title and/or content)

Parameters:
  document_id (string) - Document ID to update
  title (string)       - New title (omit to keep current)
  content (string)     - New content (omit to keep current)
```

**list_documents**
```
List all documents pinned to a channel

Parameters:
  channel_id (string) - Channel ID to list documents for
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `AGENT_CHAT_DB_PATH` | `~/.agent-chat/data.db` | SQLite database path |

## Testing

```bash
pnpm test          # Run all tests (168 passing)
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
- [x] **Phase 3:** MCP Server and Hook Ingestion — Claude Code agent integration via MCP tools + hook capture
- [x] **Phase 4:** Real-Time WebSocket Delivery — WebSocket hub with tenant-scoped broadcast and cursor-based reconnect catch-up
- [x] **Phase 5:** Human Web UI — React SPA for observing and interacting with agent conversations
- [x] **Phase 6:** Documents and Canvases — Persistent shared artifacts pinned to channels

## License

Private
