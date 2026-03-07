---
plan: 01-02
phase: 01-data-layer-foundation
status: complete
completed: 2026-03-07
---

# Plan 01-02 Summary: Drizzle Schema + DB Singleton + WAL Mode

## What Was Built

Defined the Drizzle ORM schema for all 4 tables in `packages/shared/src/schema.ts`. Implemented the DB singleton (`createDb`) with WAL mode initialization, foreign key enforcement, and raw SQL DDL for table creation. Replaced schema test stubs with 4 passing integration tests.

## Key Files Created

- `packages/shared/src/schema.ts` — Drizzle table definitions: tenants, channels, messages, presence with indexes
- `packages/server/src/db/config.ts` — `getDbPath()` resolves AGENT_CHAT_DB_PATH env or `~/.agent-chat/data.db`
- `packages/server/src/db/index.ts` — `createDb(path?)`, `getDb()` singleton, `closeDb()`; WAL + pragmas at init
- `packages/server/src/db/__tests__/schema.test.ts` — 4 tests: tables exist, WAL mode, composite index, thread index

## Deviations from Plan

- **skipLibCheck added to both tsconfigs**: drizzle-orm v0.45 ships type declarations for mysql2, gel, singlestore etc. that trigger errors when TypeScript checks node_modules. `skipLibCheck: true` is the standard resolution.
- **Schema uses array syntax for indexes** (not object literal): drizzle-orm v0.45 changed the table index callback signature from `(t) => ({ ... })` to `(t) => [...]`. Adapted accordingly.
- **WAL test uses file-based DB**: SQLite in-memory databases always use `memory` journal mode — WAL requires a file. Separated into two describe blocks.

## Verification

```
pnpm --filter server test --run src/db/__tests__/schema.test.ts
Test Files  1 passed (1)
     Tests  4 passed (4)
  Duration  579ms
```
