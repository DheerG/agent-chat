# Phase 6: Documents and Canvases — Research

**Researched:** 2026-03-07
**Phase Requirements:** DOC-01, DOC-02, DOC-03, DOC-04

## Executive Summary

Phase 6 adds persistent documents pinned to channels. The existing codebase has well-established patterns across all layers (schema, queries, services, HTTP routes, MCP tools, WebSocket broadcast, React UI) that can be replicated for documents with minimal architectural risk. The main work is extending each layer with a new `documents` entity following the exact patterns used for `messages`.

## Codebase Analysis

### Architecture Pattern (Replicate for Documents)

The project follows a consistent layered architecture:

```
Schema (shared/schema.ts) → Queries (server/db/queries/*.ts) → Service (server/services/*.ts)
  → HTTP Routes (server/http/routes/*.ts) → App Assembly (server/http/app.ts)
  → MCP Tools (mcp/src/tools/*.ts) → MCP Registration (mcp/src/index.ts)
  → WebSocket (server/ws/WebSocketHub.ts) → Client Hooks (client/hooks/*.ts)
  → Client Components (client/components/*.tsx)
```

Each entity (tenants, channels, messages, presence) follows this exact pattern. Documents will be the 5th entity.

### Data Layer Patterns

**Schema definition** (`packages/shared/src/schema.ts`):
- Drizzle ORM `sqliteTable` with text columns
- ULIDs as primary keys (string, 26 chars)
- `tenant_id` denormalized on every table for isolation
- Foreign key references to parent tables
- Indexes defined inline in the table definition
- Inferred types exported: `*Row` for select, `*Insert` for insert

**Raw DDL** (`packages/server/src/db/index.ts`):
- Tables created via raw SQL `CREATE TABLE IF NOT EXISTS` in `CREATE_TABLES_SQL`
- Indexes created via raw SQL `CREATE INDEX IF NOT EXISTS`
- This is separate from Drizzle schema — both must be updated

**Query layer** (`packages/server/src/db/queries/*.ts`):
- Factory function pattern: `createXxxQueries(instance: DbInstance, queue: WriteQueue)`
- Returns object with query methods
- tenant_id is FIRST argument on all methods (isolation enforced structurally)
- WriteQueue.enqueue() wraps all write operations
- Row-to-domain mapping functions (e.g., `rowToMessage`)
- Drizzle query builder with `eq`, `and`, `asc`, `lt`, `gt` operators

**Key difference for documents**: Messages are append-only (no UPDATE/DELETE). Documents are mutable — need an `updateDocument` query method.

### Service Layer Patterns

**Service classes** (`packages/server/src/services/*.ts`):
- Constructor takes query object and optional EventEmitter
- Methods are thin wrappers around queries with event emission
- MessageService emits `message:created` via EventEmitter for WebSocket broadcast
- Services interface and createServices factory in `services/index.ts`

**For documents**: DocumentService will emit `document:created` and `document:updated` events.

### HTTP Route Patterns

**Route modules** (`packages/server/src/http/routes/*.ts`):
- Export function returning Hono router: `function xxxRoutes(services: Services): Hono`
- Zod schemas for request validation
- Tenant/channel existence checks before operations
- Error response shape: `{ error: string, code: string }`
- Mounted in `app.ts` at nested paths under `/api/tenants/:tenantId/channels/:channelId/`

**For documents**: Routes at `/api/tenants/:tenantId/channels/:channelId/documents` and `/documents/:documentId`.

### MCP Tool Patterns

**Tool handlers** (`packages/mcp/src/tools/*.ts`):
- Export handler function: `handleXxx(services, config, tenantId, args)`
- Tool registered in `index.ts` with zod schema, description, and try/catch wrapper
- Agent identity comes from `McpConfig` (agentId, agentName)
- Returns minimal response object (not the full domain object)

**For documents**: 4 new tools: `create_document`, `read_document`, `update_document`, `list_documents`.

### WebSocket Broadcast Patterns

**WebSocketHub** (`packages/server/src/ws/WebSocketHub.ts`):
- Listens for EventEmitter events in constructor
- Currently only listens for `message:created`
- Broadcasts to all clients subscribed to the message's channel
- Tenant isolation verified on broadcast
- Server message types: `message | catchup | subscribed | unsubscribed | error | pong`

**For documents**: Add listeners for `document:created` and `document:updated`. Extend `WsServerMessage` type to include `document_created | document_updated` types. Client needs to handle these new event types.

### Client Patterns

**Hooks** (`packages/client/src/hooks/*.ts`):
- Custom React hooks: `useMessages`, `useChannels`, `useTenants`, `usePresence`, `useWebSocket`
- REST fetching with `fetch()` and `useEffect`
- State management with `useState` and `useCallback`
- WebSocket hook dispatches to message handler callback

**Components** (`packages/client/src/components/*.tsx`):
- Functional components with CSS modules (`.css` files alongside `.tsx`)
- Props interfaces defined inline
- App.tsx manages state and passes down via props (no context/store)

**For documents**: New `useDocuments` hook for REST fetching, `DocumentPanel` component, WebSocket handler extension for document events.

### Test Patterns

- **Unit tests**: vitest with `describe/test/expect`
- **DB tests**: `createDb(':memory:')` for in-memory SQLite, cleanup in afterEach
- **HTTP tests**: `app.request()` method (Hono test helper), seed helpers
- **MCP tests**: Direct handler function calls with mock services
- **Client tests**: `@testing-library/react` with render and fireEvent

**For documents**: Follow same patterns. DB tests for schema/queries, HTTP tests for routes, MCP tests for tool handlers, client tests for components.

## Validation Architecture

### Test Strategy

| Requirement | Test Type | What to Verify |
|-------------|-----------|----------------|
| DOC-01 | Integration (MCP) | Agent creates document via MCP, another agent reads it back |
| DOC-02 | Integration (MCP + WS) | Agent updates document, WebSocket event fires |
| DOC-03 | Component (Client) | DocumentPanel renders documents for selected channel |
| DOC-04 | Integration (DB) | Document survives DB close/reopen cycle |

### Test Files to Create

1. `packages/server/src/db/__tests__/documents.test.ts` — Schema, queries, persistence, tenant isolation
2. `packages/server/src/http/__tests__/documents.test.ts` — REST endpoint tests
3. `packages/mcp/src/__tests__/document-tools.test.ts` — MCP tool handler tests
4. `packages/client/src/__tests__/DocumentPanel.test.tsx` — Component render tests

### Quick Run Commands

- Server tests: `cd packages/server && npx vitest run`
- MCP tests: `cd packages/mcp && npx vitest run`
- Client tests: `cd packages/client && npx vitest run`
- All tests: `npx vitest run` (from root, if workspace configured)

## Technical Decisions

### Document Schema

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'text',
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_channel ON documents(tenant_id, channel_id);
```

### WebSocket Event Shape

```json
{ "type": "document_created", "document": { ... } }
{ "type": "document_updated", "document": { ... } }
```

These are new server message types. Existing clients ignore unknown types (JSON parse, check type field). No breaking change.

### MCP Tool Signatures

```
create_document(channel_id, title, content, content_type?) → { id, title, channelId, createdAt }
update_document(document_id, title?, content?) → { id, title, updatedAt }
read_document(document_id) → { id, title, content, contentType, channelId, createdByName, createdAt, updatedAt }
list_documents(channel_id) → [{ id, title, contentType, createdByName, updatedAt }]
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema migration breaks existing data | Low | High | `CREATE TABLE IF NOT EXISTS` — additive only |
| WebSocket new event types break clients | Low | Low | Clients ignore unknown types |
| Document content too large for SQLite TEXT | Very Low | Low | SQLite TEXT handles up to 1GB; no enforcement needed |
| MCP tool count increases startup time | Very Low | Low | 4 additional tools, negligible |

## Dependencies

- No new npm packages required
- All existing packages (better-sqlite3, drizzle-orm, hono, ws, react, vitest) are sufficient
- Drizzle ORM schema additions are straightforward (same patterns as existing tables)

---

## RESEARCH COMPLETE

All patterns identified. No blockers. Ready for planning.
