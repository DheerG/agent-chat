# Phase 2: Domain Services and HTTP API - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Service layer (MessageService, ChannelService, TenantService) wrapping Phase 1 query functions, plus a Hono REST HTTP server exposing those services over the network. Goal: business logic testable in isolation, REST API working end-to-end before WebSocket or MCP complexity is introduced. No WebSocket, no MCP in this phase.

Requirements: INFRA-03, INFRA-04, MSG-01, MSG-04, MSG-06

</domain>

<decisions>
## Implementation Decisions

### Route Structure
- REST routes under `/api` prefix
- Tenant-scoped via URL path: `/api/tenants/:tenantId/channels/:channelId/messages`
- Full hierarchy: `/api/tenants`, `/api/tenants/:tenantId/channels`, `/api/tenants/:tenantId/channels/:channelId/messages`
- Tenant auto-create endpoint: `POST /api/tenants` (upsert by codebasePath)
- Channel endpoints: `GET` (list), `POST` (create) on `/api/tenants/:tenantId/channels`
- Message endpoints: `GET` (list with pagination), `POST` (send) on `.../channels/:channelId/messages`
- Health check: `GET /health` returning `{ status: "ok", timestamp: ISO8601 }`

### Error Handling
- Uniform JSON error shape: `{ error: string, code: string }` — machine-readable code + human message
- HTTP status codes: 400 (bad request/validation), 404 (not found), 422 (unprocessable entity), 500 (internal)
- Zod for request body and query parameter validation in route handlers
- Validation errors include field-level details: `{ error: "Validation failed", code: "VALIDATION_ERROR", details: ZodIssue[] }`
- 404 for unknown tenant/channel (not 403 — no auth in scope)

### Pagination API
- Cursor-based via ULID: `?limit=50&before=<ulid>&after=<ulid>`
- Default limit: 50 messages per page
- Response shape: `{ messages: Message[], pagination: { hasMore: boolean, nextCursor?: string, prevCursor?: string } }`
- Messages returned in ascending chronological order (ULID lexicographic order)
- `before` cursor returns messages older than cursor, `after` cursor returns messages newer — enables bidirectional paging

### Service Layer
- Thin service objects: `MessageService`, `ChannelService`, `TenantService`
- Each service wraps the corresponding query functions from Phase 1 — no direct Drizzle calls in HTTP handlers
- Services injected into Hono via Hono's context variable pattern (`c.get('services')`)
- Service factory wired at startup: `createServices(db, queue)` returns `{ messages, channels, tenants }`
- Service methods match the Phase 1 query function signatures — minimal translation layer
- Keeps HTTP layer thin: handler validates input → calls service → returns response

### HTTP Server (Hono)
- Hono v4 with `@hono/node-server` adapter (Node.js HTTP compatibility)
- Server listens on port from `PORT` env var, default 3000
- Graceful shutdown on SIGTERM: stop accepting new connections, drain in-flight requests, close DB
- Server startup order: initialize DB → create services → create Hono app → start listening → register SIGTERM handler
- Request logging middleware (structured JSON log per request: method, path, status, duration)

### Testing
- Integration tests using Hono's `testClient` or direct `fetch` against the app instance (no live port needed)
- In-memory SQLite (`:memory:`) for test isolation — same pattern as Phase 1 tests
- Test each route: happy path, 404, validation errors
- Vitest (already configured in packages/server)

### Claude's Discretion
- Exact Zod schema definitions for request bodies
- Middleware ordering (logging, error handler placement)
- Exact error message strings
- Whether to use Hono's built-in validator helper or manual Zod parsing

</decisions>

<specifics>
## Specific Ideas

- Hono chosen over Express for TypeScript-first design, minimal overhead, and built-in testClient for integration testing without a live server
- Service layer is intentionally thin (no caching, no business logic beyond what queries provide) — complexity belongs in later phases
- SIGTERM handler ensures Phase 1's WAL mode and write queue drain properly before exit (INFRA-04)
- Pagination uses ULID cursors directly — no separate cursor encoding needed since ULIDs are already URL-safe

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createDb(dbPath)` / `getDb()` — Phase 1 DB factory, used as-is to initialize server
- `WriteQueue` — already implemented, passed to service layer unchanged
- `createMessageQueries(instance, queue)` — service layer wraps this directly
- `createChannelQueries(instance, queue)` — service layer wraps this directly
- `createTenantQueries(instance, queue)` — service layer wraps this directly
- Shared types (`Message`, `Channel`, `Tenant`, `PaginationOpts`) from `@agent-chat/shared` — used in HTTP response types
- Drizzle schema types (`MessageRow`, etc.) — already exported from shared

### Established Patterns
- `tenantId` as first argument to all query functions — service layer preserves this contract
- All IDs are ULIDs — HTTP layer receives/returns them as strings, no conversion needed
- `metadata` stored as JSON string, parsed to `Record<string, unknown>` in query layer — service layer returns parsed form
- Async query wrapping (enqueue returns Promise) — service layer is naturally async, Hono handlers use async/await
- In-memory SQLite (`:memory:`) for tests — test pattern established and working in Phase 1

### Integration Points
- `packages/server/src/index.ts` is currently a stub (`export {}`) — Phase 2 replaces this with server startup
- Phase 3 (MCP) will import services directly: `createServices(db, queue)` shared singleton
- Phase 4 (WebSocket) will hook into the message service's `insertMessage` to broadcast — service layer should emit events or accept an optional callback (note for Phase 4, not Phase 2)
- `packages/shared` types are the contract between server and client — no changes to shared in this phase

</code_context>

<deferred>
## Deferred Ideas

- WebSocket broadcast hook in MessageService — Phase 4 concern, not Phase 2
- Rate limiting / request throttling — out of scope for local tool
- Request authentication / API keys — explicitly out of scope (local implicit trust)
- OpenAPI/Swagger spec generation — nice-to-have, not blocking v1

</deferred>

---

*Phase: 02-domain-services-and-http-api*
*Context gathered: 2026-03-07*
