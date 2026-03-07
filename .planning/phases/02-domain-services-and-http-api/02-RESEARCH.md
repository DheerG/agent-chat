# Phase 2: Domain Services and HTTP API — Research

**Phase:** 02 — Domain Services and HTTP API
**Researched:** 2026-03-07
**Requirements:** INFRA-03, INFRA-04, MSG-01, MSG-04, MSG-06

---

## Summary

Phase 2 builds a service layer wrapping Phase 1 query functions and a Hono HTTP server exposing those services via REST. All Phase 1 primitives are implemented and tested. Phase 2 adds two layers:

1. **Services** — `TenantService`, `ChannelService`, `MessageService` thin wrappers over the query functions
2. **HTTP API** — Hono v4 server with `@hono/node-server`, structured routes, Zod validation, cursor-based pagination, graceful shutdown

No new dependencies beyond Hono and Zod are required. Vitest and in-memory SQLite are already available and proven in Phase 1 tests.

---

## Existing Codebase Inventory

### Phase 1 Assets (Ready to Consume)

| Asset | Path | Status |
|-------|------|--------|
| `createDb(path)` / `getDb()` / `closeDb()` | `packages/server/src/db/index.ts` | Complete |
| `WriteQueue` | `packages/server/src/db/queue.ts` | Complete |
| `createTenantQueries(instance, queue)` | `packages/server/src/db/queries/tenants.ts` | Complete |
| `createChannelQueries(instance, queue)` | `packages/server/src/db/queries/channels.ts` | Complete |
| `createMessageQueries(instance, queue)` | `packages/server/src/db/queries/messages.ts` | Complete |
| Shared types: `Message`, `Channel`, `Tenant`, `PaginationOpts` | `packages/shared/src/types.ts` | Complete |
| Drizzle schema + row types | `packages/shared/src/schema.ts` | Complete |

### Entry Point (Stub)

`packages/server/src/index.ts` is currently `export {}` — this is where server startup code goes.

### Test Infrastructure (Available)

- Vitest configured in `packages/server`
- In-memory SQLite (`:memory:`) pattern established in all Phase 1 tests
- Test pattern: `createDb(':memory:')` + `new WriteQueue()` + query factory function

---

## Dependencies to Add

### Hono + Node Adapter

```bash
pnpm add hono @hono/node-server --filter @agent-chat/server
```

- **Hono v4** — TypeScript-first, minimal overhead, built-in `testClient` for integration tests without a live port
- **`@hono/node-server`** — wraps Hono app for Node.js `http.createServer` compatibility, provides `serve()` and SIGTERM handling hooks

### Zod (Request Validation)

```bash
pnpm add zod --filter @agent-chat/server
```

- Zod is not yet in `packages/server/package.json` — must be added
- Used for: validating POST request bodies and GET query parameters (limit, before, after cursors)

---

## File Structure to Create

```
packages/server/src/
├── index.ts                          # Replace stub — server startup
├── services/
│   ├── index.ts                      # createServices(db, queue) factory
│   ├── TenantService.ts
│   ├── ChannelService.ts
│   └── MessageService.ts
├── http/
│   ├── app.ts                        # createApp(services) — Hono app factory
│   ├── middleware/
│   │   ├── requestLogger.ts          # Structured JSON request logging
│   │   └── errorHandler.ts           # Global error -> uniform JSON response
│   └── routes/
│       ├── health.ts                 # GET /health
│       ├── tenants.ts                # /api/tenants
│       ├── channels.ts               # /api/tenants/:tenantId/channels
│       └── messages.ts               # /api/tenants/:tenantId/channels/:channelId/messages
└── __tests__/
    ├── health.test.ts
    ├── tenants.test.ts
    ├── channels.test.ts
    └── messages.test.ts
```

---

## Service Layer Design

### Pattern

Each service is a thin object wrapping corresponding query functions. No caching, no business logic beyond what queries already provide.

```typescript
// services/index.ts
export interface Services {
  tenants: TenantService;
  channels: ChannelService;
  messages: MessageService;
}

export function createServices(instance: DbInstance, queue: WriteQueue): Services {
  const tenantQ = createTenantQueries(instance, queue);
  const channelQ = createChannelQueries(instance, queue);
  const messageQ = createMessageQueries(instance, queue);
  return {
    tenants: new TenantService(tenantQ),
    channels: new ChannelService(channelQ),
    messages: new MessageService(messageQ),
  };
}
```

### TenantService

```typescript
class TenantService {
  upsertByCodebasePath(name: string, codebasePath: string): Promise<Tenant>
  // Checks if tenant with codebasePath exists → return it; else insert

  getById(id: string): Tenant | null
}
```

Note: `insertTenant` in the query layer does not upsert — `TenantService.upsertByCodebasePath` adds this logic by calling `getTenantByCodebasePath` first.

### ChannelService

```typescript
class ChannelService {
  create(tenantId: string, data: { name: string; sessionId?: string; type?: 'session' | 'manual' }): Promise<Channel>
  listByTenant(tenantId: string): Channel[]
  getById(tenantId: string, channelId: string): Channel | null
}
```

### MessageService

```typescript
class MessageService {
  send(tenantId: string, data: InsertMessageData): Promise<Message>
  list(tenantId: string, channelId: string, opts: PaginationOpts): Message[]
  // list() handles before/after cursor filtering (not yet in Phase 1 getMessages)
  getById(tenantId: string, messageId: string): Message | null
}
```

**Important:** Phase 1's `getMessages` accepts `PaginationOpts` but ignores the `before`/`after` cursors (only `limit` is wired). `MessageService.list()` must implement cursor filtering — using Drizzle `lt(messages.id, before)` / `gt(messages.id, after)` via direct Drizzle query or by extending the query layer.

Options:
1. **Extend query layer** — add `before`/`after` support to `createMessageQueries` (preferred: keeps DB logic in queries)
2. **Filter in service** — fetch all then slice (unacceptable for large channels)

**Decision: Extend the query layer** — add `lt`/`gt` conditions to `getMessages` in `messages.ts`.

---

## HTTP API Design

### Hono App Factory

```typescript
// http/app.ts
import { Hono } from 'hono';
import type { Services } from '../services/index.js';

export function createApp(services: Services): Hono {
  const app = new Hono();
  // middleware
  app.use('*', requestLogger());
  app.onError(errorHandler);
  // routes
  app.route('/health', healthRoutes());
  app.route('/api/tenants', tenantRoutes(services));
  // channel + message routes nested under tenants
  return app;
}
```

### Hono Context Variables

Services injected via Hono's typed context variable pattern:

```typescript
type Variables = { services: Services };
const app = new Hono<{ Variables: Variables }>();
app.use('*', async (c, next) => { c.set('services', services); await next(); });
```

### Route Definitions

**Health:**
```
GET /health → { status: "ok", timestamp: string }
```

**Tenants:**
```
GET  /api/tenants               → { tenants: Tenant[] }
POST /api/tenants               → { tenant: Tenant }  body: { name, codebasePath }  (upsert)
GET  /api/tenants/:tenantId     → { tenant: Tenant }  (404 if not found)
```

**Channels:**
```
GET  /api/tenants/:tenantId/channels            → { channels: Channel[] }
POST /api/tenants/:tenantId/channels            → { channel: Channel }  body: { name, sessionId?, type? }
GET  /api/tenants/:tenantId/channels/:channelId → { channel: Channel }
```

**Messages:**
```
GET  /api/tenants/:tenantId/channels/:channelId/messages
     → { messages: Message[], pagination: { hasMore, nextCursor?, prevCursor? } }
     query: ?limit=50&before=<ulid>&after=<ulid>

POST /api/tenants/:tenantId/channels/:channelId/messages
     → { message: Message }
     body: { senderId, senderName, senderType, content, messageType?, parentMessageId?, metadata? }
```

### Error Response Shape

```typescript
// All errors → this shape
{ error: string; code: string; details?: ZodIssue[] }

// Status codes:
// 400 — bad request (malformed)
// 404 — tenant/channel not found
// 422 — validation failure (Zod)
// 500 — internal server error
```

### Zod Validation Approach

Use Hono's `zValidator` helper (from `hono/validator`) with Zod schemas. This handles parse errors and returns 422 automatically:

```typescript
import { zValidator } from '@hono/zod-validator';
// Note: @hono/zod-validator is a separate package — use hono's built-in validator instead

// Alternative: manual Zod parsing in handler
const result = Schema.safeParse(await c.req.json());
if (!result.success) {
  return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
}
```

**Recommendation:** Use manual Zod parsing to avoid adding `@hono/zod-validator` package. Hono's built-in `c.req.valid()` path also works but requires the validator middleware.

---

## Pagination Implementation

### Cursor Logic

Messages table uses ULID as primary key. ULID is URL-safe and lexicographically ordered (chronological).

```typescript
// Extend messages.ts getMessages() to handle cursors:
import { eq, and, asc, lt, gt } from 'drizzle-orm';

function getMessages(tenantId: string, channelId: string, opts: PaginationOpts = {}): Message[] {
  const limit = opts.limit ?? 50;
  const conditions = [eq(messages.tenantId, tenantId), eq(messages.channelId, channelId)];

  if (opts.before) conditions.push(lt(messages.id, opts.before));
  if (opts.after)  conditions.push(gt(messages.id, opts.after));

  return db.select().from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.id))
    .limit(limit + 1)  // fetch N+1 to determine hasMore
    .all()
    .map(rowToMessage);
}
```

### hasMore + Cursor Derivation (in MessageService)

```typescript
list(tenantId, channelId, opts) {
  const limit = opts.limit ?? 50;
  const rows = this.messageQ.getMessages(tenantId, channelId, { ...opts, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: items,
    pagination: {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      prevCursor: items[0]?.id,
    },
  };
}
```

---

## Server Startup and Graceful Shutdown

### Startup Sequence (index.ts)

```typescript
import { serve } from '@hono/node-server';
import { createDb } from './db/index.js';
import { WriteQueue } from './db/queue.js';
import { createServices } from './services/index.js';
import { createApp } from './http/app.js';

const port = Number(process.env['PORT'] ?? 3000);
const instance = createDb();
const queue = new WriteQueue();
const services = createServices(instance, queue);
const app = createApp(services);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ event: 'server_started', port: info.port }));
});

// SIGTERM: stop accepting new connections, drain in-flight requests, close DB
process.once('SIGTERM', async () => {
  console.log(JSON.stringify({ event: 'graceful_shutdown_started' }));
  server.close(async () => {
    // Wait for any pending queue writes
    while (queue.pendingCount > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
    instance.close();
    console.log(JSON.stringify({ event: 'graceful_shutdown_complete' }));
    process.exit(0);
  });
});
```

**SIGTERM concern:** `server.close()` stops new connections but in-flight requests continue. The WriteQueue drain loop (polling `pendingCount`) ensures no messages are lost before `instance.close()`.

---

## Testing Strategy

### Integration Tests (Hono testClient)

Hono provides `testClient` which calls `app.fetch` directly — no live port required. SQLite in-memory DB for test isolation.

```typescript
import { testClient } from 'hono/testing';
import { createApp } from '../http/app.js';
import { createDb } from '../db/index.js';
import { WriteQueue } from '../db/queue.js';
import { createServices } from '../services/index.js';

function createTestApp() {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  return { app: createApp(services), instance };
}
```

### Test Coverage Required

Per CONTEXT.md decisions and success criteria:

| Test File | Covers |
|-----------|--------|
| `health.test.ts` | GET /health returns 200 with correct shape |
| `tenants.test.ts` | POST (create, upsert idempotency), GET list, GET by id, 404 |
| `channels.test.ts` | POST (create), GET list, GET by id, 404 for unknown tenant/channel |
| `messages.test.ts` | POST (send), GET with pagination (limit, before, after, hasMore), 404, 422 validation |

### Key Test Scenarios

1. **Routing correctness** — POST to `/api/tenants/:id/channels/:id/messages` inserts and returns via GET
2. **Pagination** — 3 messages, limit=2: first page returns 2+hasMore, second page returns 1+!hasMore
3. **Sender identity** — senderName and senderType present in GET response (MSG-06)
4. **Validation errors** — missing required fields return 422 with `details` array
5. **404 for unknown IDs** — tenant not found, channel not found
6. **Graceful shutdown** — WriteQueue drains before DB close (integration test with real queue)

---

## Validation Architecture

### What Gets Validated Where

| Layer | Validation | Mechanism |
|-------|-----------|-----------|
| HTTP request body | Required fields, type constraints, enum values | Zod schemas in route handlers |
| HTTP query params | limit (number, 1-100), before/after (string, optional) | Zod schema |
| Service layer | Business rules (tenant exists before channel ops) | 404 throw in service |
| Query layer | None — assumes valid inputs from service | — |

### Zod Schemas (Key Ones)

```typescript
// POST /api/tenants
const CreateTenantSchema = z.object({
  name: z.string().min(1),
  codebasePath: z.string().min(1),
});

// POST .../channels
const CreateChannelSchema = z.object({
  name: z.string().min(1),
  sessionId: z.string().optional(),
  type: z.enum(['session', 'manual']).optional(),
});

// POST .../messages
const SendMessageSchema = z.object({
  senderId: z.string().min(1),
  senderName: z.string().min(1),
  senderType: z.enum(['agent', 'human', 'system', 'hook']),
  content: z.string().min(1),
  messageType: z.enum(['text', 'event', 'hook']).optional(),
  parentMessageId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET .../messages query params
const MessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
  after: z.string().optional(),
});
```

### Error Code Registry

| Code | HTTP Status | When |
|------|-------------|------|
| `VALIDATION_ERROR` | 422 | Zod schema failure |
| `NOT_FOUND` | 404 | Tenant/channel/message not found |
| `INTERNAL_ERROR` | 500 | Unhandled exception |
| `BAD_REQUEST` | 400 | Malformed JSON body |

### Success Criteria Verification Map

| Success Criterion | Test(s) |
|-------------------|---------|
| POST /api/messages routes to correct tenant+channel → retrievable via GET | `messages.test.ts` routing test |
| Paginated history with correct ordering and page boundaries | `messages.test.ts` pagination tests |
| Sender identity fields present in list responses (MSG-06) | `messages.test.ts` identity test |
| SIGTERM graceful shutdown without dropping messages | `shutdown.test.ts` or integration test |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `before`/`after` cursor logic edge cases (empty channel, single message) | Medium | Explicit test for each edge case |
| `upsertByCodebasePath` race condition (concurrent inserts same path) | Low | SQLite UNIQUE constraint on `codebase_path` gives integrity error — catch and retry in service |
| Hono `serve()` API differs between versions | Low | Pin Hono v4, read `@hono/node-server` docs |
| WriteQueue `pendingCount` drain in SIGTERM — polling delay | Low | Acceptable: 10ms intervals, SQLite writes are fast |
| TypeScript strict mode — Hono generics complexity | Medium | Use `Variables` typed context pattern from Hono docs |

---

## Implementation Order (Recommended)

1. Add `hono`, `@hono/node-server`, `zod` to `packages/server/package.json`
2. Extend `getMessages` in query layer to support `before`/`after` cursors (Drizzle `lt`/`gt`)
3. Create service layer (`services/index.ts`, `TenantService.ts`, `ChannelService.ts`, `MessageService.ts`)
4. Create HTTP layer (`http/app.ts`, middleware, routes)
5. Update `packages/server/src/index.ts` with full server startup + SIGTERM handler
6. Write integration tests using `testClient`
7. Confirm `pnpm test` passes in `packages/server`

---

## RESEARCH COMPLETE

Phase 2 research complete. All Phase 1 primitives verified. Hono + Zod pattern documented. Cursor pagination logic designed. Service layer thin-wrapper pattern specified. Test strategy covers all 4 success criteria.
