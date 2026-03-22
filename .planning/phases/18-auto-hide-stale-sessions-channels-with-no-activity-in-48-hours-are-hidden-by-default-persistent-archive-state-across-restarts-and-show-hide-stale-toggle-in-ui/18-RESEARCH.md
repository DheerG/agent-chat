# Phase 18: Auto-hide Stale Sessions - Research

**Completed:** 2026-03-22

## Validation Architecture

### Critical Paths to Test
1. Stale channel detection via SQL join with messages table
2. `user_archived` flag preventing auto-restore on server restart
3. Sidebar toggle showing/hiding stale channels
4. Channel list API with `include_stale` query parameter

### Boundary Conditions
- Channel with zero messages (empty) = stale
- Channel with last message at exactly 48 hours ago = stale
- Channel with last message at 47h59m ago = NOT stale
- Archived channel (user_archived=true) not auto-restored by TeamInboxWatcher
- Archived channel (user_archived=false, system-archived) IS auto-restored

## Research Findings

### 1. Stale Detection Strategy

**Approach:** Server-side SQL query joining channels with MAX(messages.created_at).

```sql
SELECT c.*,
  CASE
    WHEN m.last_activity IS NULL THEN 1  -- no messages = stale
    WHEN m.last_activity < datetime('now', '-48 hours') THEN 1
    ELSE 0
  END as is_stale
FROM channels c
LEFT JOIN (
  SELECT channel_id, MAX(created_at) as last_activity
  FROM messages
  GROUP BY channel_id
) m ON c.id = m.channel_id
WHERE c.tenant_id = ? AND c.archived_at IS NULL
```

**Performance:** The messages table has an index on `(tenant_id, channel_id, id)`. The GROUP BY on channel_id will use this index efficiently. For typical usage with <100 channels per tenant, this is sub-millisecond.

**Alternative considered:** Using `channels.updated_at` — rejected because this field tracks channel metadata changes (name updates, etc.), not message activity. The `updated_at` is only set at channel creation time in the current code.

### 2. Persistent Archive State (user_archived flag)

**Root cause analysis:** When the server restarts, `TeamInboxWatcher.start()` calls `scanTeams()` which calls `processTeam()` for each team. In `processTeam()`:
1. `TenantService.upsertByCodebasePath()` auto-restores archived tenants
2. `ChannelService.findByName()` + `restore()` auto-restores archived channels

Both of these undo user-initiated archives.

**Fix approach:** Add `user_archived` INTEGER column (0/1 boolean) to both channels and tenants tables. Default 0.

- When user archives via UI (PATCH /archive): Set `user_archived = 1`
- When user restores via UI (PATCH /restore): Set `user_archived = 0`
- In `TeamInboxWatcher.processTeam()`: Check `user_archived` before restoring — skip if `user_archived = 1`
- In `TenantService.upsertByCodebasePath()`: Check `user_archived` before restoring — skip if `user_archived = 1`

**Migration:**
```sql
ALTER TABLE channels ADD COLUMN user_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN user_archived INTEGER NOT NULL DEFAULT 0;
```
Uses the existing try/catch idempotent migration pattern in `db/index.ts`.

**Schema update:** Add `userArchived` field to the Drizzle schema in shared/schema.ts and to the Channel/Tenant interfaces in shared/types.ts.

### 3. Channel List API Enhancement

**Current:** `GET /api/tenants/:tenantId/channels` returns all active (non-archived) channels.

**Enhanced:** Accept `?include_stale=true` query parameter.

- Default (no param): Return only non-stale, non-archived channels
- `include_stale=true`: Return all non-archived channels with `stale: boolean` on each

**The `stale` field** should be added to the Channel API response but NOT to the core Channel interface in shared/types.ts. Instead, create a `ChannelWithStale` response type that extends Channel with `stale?: boolean`.

### 4. Sidebar UI Changes

**Current sidebar structure:**
```
[Sidebar header]
[Tenant switcher]
[Channel list]
  - Channel list header: "Channels"
  - Channel items (clickable, with archive button on hover)
[Archived section (collapsible)]
```

**New structure:**
```
[Sidebar header]
[Tenant switcher]
[Channel list]
  - Channel list header: "Channels" + [Show stale toggle]
  - Active channel items
  - (When toggle on) Stale channel items (dimmed style)
[Archived section (collapsible)]
```

**Toggle state:** Persisted in localStorage using key `agentchat_show_stale` (same pattern as tenant selection).

**Stale channel styling:**
- Reduced opacity (0.5)
- Italic channel name text
- Muted hash symbol color
- No change to click behavior — stale channels are still fully functional when clicked

### 5. Files to Modify

**Backend:**
1. `packages/shared/src/schema.ts` — Add `userArchived` column to channels and tenants
2. `packages/shared/src/types.ts` — Add `userArchived` to Channel and Tenant interfaces
3. `packages/server/src/db/index.ts` — Migration for `user_archived` column
4. `packages/server/src/db/queries/channels.ts` — Add stale-aware query, update archive/restore for user_archived
5. `packages/server/src/db/queries/tenants.ts` — Update archive/restore for user_archived
6. `packages/server/src/services/ChannelService.ts` — Add `listByTenantWithStale` method
7. `packages/server/src/services/TenantService.ts` — Respect user_archived in upsertByCodebasePath
8. `packages/server/src/http/routes/channels.ts` — Accept include_stale param
9. `packages/server/src/watcher/TeamInboxWatcher.ts` — Respect user_archived flag

**Frontend:**
10. `packages/client/src/lib/api.ts` — Add include_stale param to fetchChannels
11. `packages/client/src/hooks/useChannels.ts` — Accept includeStale option
12. `packages/client/src/components/Sidebar.tsx` — Add stale toggle, stale channel rendering
13. `packages/client/src/components/Sidebar.css` — Stale channel styles

**Tests:**
14. `packages/server/src/http/__tests__/channels.test.ts` — Stale channel API tests
15. `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — user_archived respect tests
16. `packages/client/src/__tests__/Sidebar.test.tsx` — Stale toggle tests

### 6. Existing Test Patterns

Tests use vitest with in-memory SQLite databases. The channel test file creates tenants/channels via HTTP helpers and asserts on API responses. The TeamInboxWatcher tests mock the file system and assert on service interactions.

The client tests use `@testing-library/react` with vitest mocking of API calls.

---

*Research completed: 2026-03-22*
