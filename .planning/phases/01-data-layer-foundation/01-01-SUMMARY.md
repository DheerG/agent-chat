---
plan: 01-01
phase: 01-data-layer-foundation
status: complete
completed: 2026-03-07
---

# Plan 01-01 Summary: Monorepo Scaffold + Test Stubs

## What Was Built

Initialized the pnpm monorepo from scratch with TypeScript project references. Created `packages/shared` (domain types) and `packages/server` (server package with test infrastructure). Established the foundational build system that all subsequent plans depend on.

## Key Files Created

- `package.json` — root pnpm workspace with build/test/typecheck scripts; includes `pnpm.onlyBuiltDependencies` for better-sqlite3 and esbuild native builds
- `pnpm-workspace.yaml` — workspace definition (`packages/*`)
- `tsconfig.json` — root with project references to shared and server
- `.npmrc` — `shamefully-hoist=true` for native addon resolution
- `packages/shared/src/types.ts` — Tenant, Channel, Message, Presence, PaginationOpts interfaces
- `packages/server/vitest.config.ts` — vitest configuration (no watch mode)
- 4 integration test stub files with `test.todo()` — all 13 tests in todo state, exit 0

## Deviations from Plan

- **better-sqlite3 upgraded from v9 to v12.6**: Node.js v25.0.0 is incompatible with better-sqlite3 v9 native addon (C++ header incompatibility). v12.6 supports Node 25.
- **drizzle-orm upgraded from v0.30 to v0.45**: Better compatibility with v12 better-sqlite3.
- **vitest upgraded from v1 to v3**: Latest stable, better ESM support.
- **pnpm.onlyBuiltDependencies added to root package.json**: Required for pnpm v10's build script approval system.

## Verification

```
pnpm --filter server test --run
Test Files  4 skipped (4)
     Tests  13 todo (13)
  Start at  07:26:21
  Duration  351ms
```
