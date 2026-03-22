# Phase 21: Auto-restore archived channels on new activity — Research

**Completed:** 2026-03-22
**Method:** Inline codebase analysis (all relevant files read and analyzed)

## Summary

Phase 21 needs to change the archive behavior from "reject writes" to "auto-restore + accept". This affects 5 integration points.

## Validation Architecture

### Test Infrastructure
- **Framework:** vitest
- **Quick run:** `cd packages/server && npx vitest run --reporter=verbose`
- **Full suite:** `npm run test` (runs all packages)
- **Existing tests:** 318+ tests across server (183), client (87), MCP (48)

### What Needs Testing
1. Auto-restore on message POST to archived channel (currently returns 409 — need to change to 201)
2. Auto-restore on document POST to archived channel (same 409 → 201 change)
3. Auto-restore on SessionStart when archived session channel exists with same name
4. Override of user_archived in TeamInboxWatcher.processTeam
5. Override of user_archived in TenantService.upsertByCodebasePath
6. Tenant cascade: restoring channel also restores its archived tenant

## Current Architecture

### 1. Message POST (409 CHANNEL_ARCHIVED)
**File:** `packages/server/src/http/routes/messages.ts` (lines 63-65)
```typescript
if (channel.archivedAt) {
  return c.json({ error: 'Channel is archived', code: 'CHANNEL_ARCHIVED' }, 409);
}
```
**Change:** Replace rejection with auto-restore call, then continue to message send.

### 2. Document POST (409 CHANNEL_ARCHIVED)
**File:** `packages/server/src/http/routes/documents.ts` (lines 69-71)
```typescript
if (channel.archivedAt) {
  return c.json({ error: 'Channel is archived', code: 'CHANNEL_ARCHIVED' }, 409);
}
```
**Change:** Same pattern as messages — auto-restore, then proceed.

### 3. SessionStart Hook Handler
**File:** `packages/server/src/hooks/handlers.ts` (lines 29-61)
- Currently always creates a NEW channel: `services.channels.create(tenantId, { name: channelName, ... })`
- Does NOT check if an existing archived channel has the same name
- **Change:** Before creating, use `services.channels.findByName(tenantId, channelName)` to check for existing (archived) channel. If found, restore it.

### 4. TeamInboxWatcher.processTeam user_archived check
**File:** `packages/server/src/watcher/TeamInboxWatcher.ts` (line 174)
```typescript
if (channel.archivedAt && !channel.userArchived) {
```
**Change:** Remove `!channel.userArchived` check — always restore regardless of who archived it.

### 5. TenantService.upsertByCodebasePath user_archived check
**File:** `packages/server/src/services/TenantService.ts` (line 15)
```typescript
if (existing.archivedAt && !existing.userArchived) {
```
**Change:** Remove `!existing.userArchived` check — always restore regardless of who archived it.

## Design Considerations

### Tenant cascade on channel restore
When restoring a channel because of new activity, the parent tenant must also be active — otherwise the channel is invisible in the UI sidebar (the sidebar only shows active tenants).

**Pattern:** In the route handlers (messages.ts, documents.ts), after restoring the channel, check if the tenant is archived and restore it too. The `TenantService.restore(id)` method already handles cascading (restores all channels), but we only need the tenant itself restored here — the specific channel is already being restored.

We should use a targeted approach: check the tenant, restore just the tenant if needed (using `tenantQ.restoreTenant()` via a new method), then restore the channel. But since `TenantService.restore()` cascades to ALL channels, we should just use the query-level restoreTenant directly. Actually, the simplest approach is to use `services.tenants.restore(tenantId)` which restores tenant + all its channels. Since we're already restoring the specific channel, restoring all channels is fine — they'll come back too if needed.

Better approach: Add a helper method or use the existing infrastructure. Actually the best approach:
1. Call `services.channels.restore(tenantId, channelId)` to restore the channel
2. Check the tenant: `services.tenants.getById(tenantId)` — if archived, call `services.tenants.restore(tenantId)`

This is clean and uses existing methods.

### Impact on existing tests
The test `POST message to archived channel returns 409 CHANNEL_ARCHIVED` in `messages.test.ts` will need to be updated. It currently expects 409 — it should now expect 201 (auto-restore + accept).

Similarly, any document tests expecting 409 will need updating.

## Reusable Patterns
- `ChannelService.findByName(tenantId, name)` — already used in TeamInboxWatcher for channel reuse
- `ChannelService.restore(tenantId, channelId)` — already exists
- `TenantService.restore(id)` — already exists
- Structured JSON logging pattern used across all services

## Risk Assessment
- **Low risk:** All changes are additive (removing restrictions, adding restore calls)
- **No schema changes needed** — all DB operations already exist
- **No API contract changes** — only the 409 behavior changes (to 201)
- **Backward compatible** — restoring on activity is strictly more permissive than rejecting
