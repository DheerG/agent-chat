---
phase: 10-fix-dogfood-bugs-archived-channel-writes-failing-client-tests-tenant-upsert-name
plan: 01
status: complete
started: 2026-03-07
completed: 2026-03-07
---

# Plan 10-01 Summary: Fix Dogfood Bugs

## What Was Built

Fixed three bugs discovered during dogfood testing:

1. **Archived channel write guard** — POST to message and document routes now checks `channel.archivedAt` and returns HTTP 409 with error code `CHANNEL_ARCHIVED`. GET (read) operations remain allowed for historical access.

2. **Tenant name upsert** — `TenantService.upsertByCodebasePath` now updates the tenant name when an existing tenant is found with a different name. Skips the write when names already match.

3. **Sidebar archive tests** — Verified all 15 Sidebar tests pass, including archive button tests with ConfirmDialog flow. Tests were already fixed in Phase 9.

## Key Files

### Created
(none)

### Modified
- `packages/server/src/http/routes/messages.ts` — Archive check on POST handler
- `packages/server/src/http/routes/documents.ts` — Archive check on POST handler
- `packages/server/src/http/__tests__/messages.test.ts` — Two new archived channel tests
- `packages/server/src/services/TenantService.ts` — Name update in upsert logic
- `packages/server/src/db/queries/tenants.ts` — New `updateTenantName` query
- `packages/server/src/http/__tests__/tenants.test.ts` — New name update test

## Test Results

- Server: 115 tests passed (was 112, +3 new)
- MCP: 24 tests passed
- Client: 57 tests passed
- **Total: 196 tests, zero failures, zero regressions**

## Self-Check: PASSED

- POST to archived channel returns 409 CHANNEL_ARCHIVED
- POST document to archived channel returns 409 CHANNEL_ARCHIVED
- GET messages from archived channel still works (200)
- Tenant upsert with different name updates name
- All Sidebar archive tests pass
- Full test suite green

## Deviations

- Bug 2 (failing client tests) was already resolved in Phase 9 when ConfirmDialog replaced `window.confirm()`. The tests were updated at that time. No changes needed.

## Decisions Made

- Document routes also received the archive write guard (same vulnerability as messages)
- `updateTenantName` uses Drizzle ORM for consistency with other queries
- Name update skips the DB write when names match (optimization)
