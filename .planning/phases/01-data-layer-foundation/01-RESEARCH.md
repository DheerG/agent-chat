# Phase 1: Data Layer Foundation - Research

**Phase:** 1
**Date:** 2026-03-07
**Status:** RESEARCH COMPLETE

## What I Need to Know to Plan This Phase Well

### Technology Stack Confirmed

**better-sqlite3 vs alternatives:**
- `better-sqlite3` is synchronous — perfect for a write serialization queue (queue wraps sync calls, no promise chaining complexity)
- `@libsql/client` (async) would require complex async queue logic; wrong fit here
- `node:sqlite` (Node.js built-in, v22.5+) is available but lacks ecosystem maturity and Drizzle integration
- **Decision**: `better-sqlite3` is the right choice, confirmed by CONTEXT.md

**Drizzle ORM:**
- `drizzle-orm` + `drizzle-kit` for type-safe schema and migrations
- `drizzle-orm/better-sqlite3` dialect
- Schema defined in TypeScript with full type inference
- `drizzle-kit push` for dev (applies schema changes directly)
- `drizzle-kit generate` + `drizzle-kit migrate` for production-safe migration files

**WAL Mode:**
- Enable with `PRAGMA journal_mode=WAL` at DB initialization
- `PRAGMA busy_timeout=5000` as fallback for lock contention
- WAL allows concurrent reads while write is in progress — critical for agent teams
- `synchronous=NORMAL` with WAL is safe and faster than FULL

**ULID:**
- `ulid` npm package — generates 26-char sortable string IDs
- Lexicographic sort = chronological sort → no separate `ORDER BY created_at` index needed for basic ordering
- `created_at` still stored for human readability and explicit range queries

### Monorepo Structure

```
agent-chat/
├── package.json          (root, pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.json         (root, project references)
├── packages/
│   ├── shared/           (types, schemas, constants)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts      (Message, Channel, Tenant, etc.)
│   │       └── schema.ts     (Drizzle table definitions)
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── db/
│           │   ├── index.ts      (DB singleton, WAL setup)
│           │   ├── queue.ts      (write serialization queue)
│           │   └── queries/      (tenant-scoped query functions)
│           │       ├── tenants.ts
│           │       ├── channels.ts
│           │       └── messages.ts
│           └── config.ts
```

### Schema Design

**tenants table:**
```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  codebase_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

**channels table:**
```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  session_id TEXT,
  type TEXT NOT NULL DEFAULT 'manual', -- 'session' | 'manual'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_channels_tenant ON channels(tenant_id);
```

**messages table:**
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id), -- denormalized
  parent_message_id TEXT REFERENCES messages(id),
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'agent' | 'human' | 'system' | 'hook'
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'event' | 'hook'
  metadata TEXT DEFAULT '{}', -- JSON stored as TEXT
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_tenant_channel ON messages(tenant_id, channel_id, id);
CREATE INDEX idx_messages_thread ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
```

**presence table:**
```sql
CREATE TABLE presence (
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'idle'
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, tenant_id, channel_id)
);
CREATE INDEX idx_presence_tenant ON presence(tenant_id);
```

### Write Serialization Queue

Pattern: async queue that serializes calls to better-sqlite3's synchronous API.

```typescript
class WriteQueue {
  private queue: Array<() => void> = [];
  private running = false;

  async enqueue<T>(fn: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        try { resolve(fn()); }
        catch (e) { reject(e); }
        this.next();
      });
      if (!this.running) this.next();
    });
  }

  private next() {
    const task = this.queue.shift();
    if (!task) { this.running = false; return; }
    this.running = true;
    task();
  }
}
```

All write operations (INSERT, UPDATE) go through the queue. Reads bypass it (better-sqlite3 handles concurrent reads safely).

### Tenant Isolation Pattern

Query functions ALWAYS take `tenantId` as the first argument:

```typescript
function getMessages(tenantId: string, channelId: string, opts?: QueryOpts) {
  return db.select().from(messages)
    .where(and(eq(messages.tenantId, tenantId), eq(messages.channelId, channelId)));
}
```

TypeScript type system prevents forgetting `tenantId` — functions won't compile without it.

### Testing Strategy

- **Integration tests** using Vitest (not Jest — better ESM/TypeScript support)
- Each test creates a fresh in-memory SQLite DB (`:memory:`) — fast, isolated
- Tenant isolation tested: write under tenant A, query under tenant B → expect 0 results
- WAL + queue tested: concurrent writes from multiple "agents" → no SQLITE_BUSY errors
- Persistence tested: write, close DB, reopen, read → data survives

### Migration Strategy

- `drizzle-kit push` for development (no migration files needed during dev)
- Migration files generated with `drizzle-kit generate` for any schema changes post-v1
- DB file stored at `~/.agent-chat/data.db` (configurable via env var `AGENT_CHAT_DB_PATH`)

## Validation Architecture

### Test Coverage Plan

| What to Test | How | Pass Criteria |
|---|---|---|
| Schema tables exist | Query sqlite_master | All 4 tables present |
| WAL mode active | `PRAGMA journal_mode` | Returns "wal" |
| Write queue serialization | 50 concurrent writes | 0 SQLITE_BUSY errors, all 50 committed |
| Tenant isolation | Write A, query B | 0 rows returned |
| Message persistence | Write, close, reopen, query | Row returned with correct data |
| ULID ordering | Insert 3 messages, query ordered | Lexicographic = insertion order |
| Composite index exists | Query sqlite_master | Index on (tenant_id, channel_id, id) |

### Integration Test File

`packages/server/src/db/__tests__/integration.test.ts`

## Key Risks

1. **pnpm workspace hoisting** — ensure `better-sqlite3` native bindings build correctly; may need `shamefully-hoist=true` in `.npmrc`
2. **Drizzle + better-sqlite3 version compatibility** — pin compatible versions upfront
3. **TypeScript project references** — shared package must build before server; configure `composite: true` in tsconfig
4. **WAL file cleanup** — `.db-wal` and `.db-shm` files must be gitignored

## RESEARCH COMPLETE
