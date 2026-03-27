# Plan 24-01 Summary: All Chats View

**Status:** Complete
**Duration:** Single session
**Commits:** 4

## What Was Built

Cross-tenant "All Chats" view that shows channels from ALL tenants in a single flat list sorted by last activity, with tenant labels and relative timestamps.

### Key Changes

1. **Shared type** (`packages/shared/src/types.ts`): Added `RecentChannel` interface extending `Channel` with `tenantName` and `lastActivity` fields.

2. **Backend query** (`packages/server/src/db/queries/channels.ts`): Added `getRecentChannelsAcrossTenants(limit)` — raw SQL query joining channels, tenants, and messages, sorted by `COALESCE(last_activity, created_at) DESC`.

3. **Service layer** (`packages/server/src/services/ChannelService.ts`): Added `listRecentAcrossTenants(limit)` service method.

4. **API route** (`packages/server/src/http/routes/allChannels.ts`): New `GET /api/channels/recent` endpoint at `/api/channels` (separate from tenant-scoped routes). Supports `?limit=N` query param (default 100, max 500).

5. **Client API** (`packages/client/src/lib/api.ts`): Added `fetchRecentChannels(limit?)` function.

6. **Time utility** (`packages/client/src/lib/timeUtils.ts`): Created `formatRelativeTime()` — formats ISO timestamps as "just now", "2m ago", "3h ago", "5d ago", "2mo ago", "1y ago".

7. **React hook** (`packages/client/src/hooks/useRecentChannels.ts`): `useRecentChannels(refreshKey)` following existing hook patterns.

8. **Sidebar UI** (`packages/client/src/components/Sidebar.tsx`):
   - "All Chats" toggle button between header and tenant switcher
   - When active, shows cross-tenant channel list with channel name, tenant label, and relative timestamp
   - Archived channels shown with dimmed opacity and line-through text
   - Clicking channel calls `onChannelSelect(tenantId, channelId)` for correct navigation

9. **CSS** (`packages/client/src/components/Sidebar.css`): Styles for All Chats toggle, channel info layout (two-line: name + tenant label), timestamp display, and archived channel styling.

## Test Results

- **Server:** 231 tests pass (8 new allChannels tests)
- **Client:** 98 tests pass (7 new All Chats Sidebar tests, App test fixes)
- **MCP:** 48 tests pass (no changes)
- **Type checks:** All 3 packages clean

## key-files

### created
- `packages/server/src/http/routes/allChannels.ts`
- `packages/server/src/http/__tests__/allChannels.test.ts`
- `packages/client/src/lib/timeUtils.ts`
- `packages/client/src/hooks/useRecentChannels.ts`

### modified
- `packages/shared/src/types.ts`
- `packages/server/src/db/queries/channels.ts`
- `packages/server/src/services/ChannelService.ts`
- `packages/server/src/http/app.ts`
- `packages/client/src/lib/api.ts`
- `packages/client/src/components/Sidebar.tsx`
- `packages/client/src/components/Sidebar.css`
- `packages/client/src/App.tsx`
- `packages/client/src/__tests__/Sidebar.test.tsx`
- `packages/client/src/__tests__/App.test.tsx`

## Issues Encountered

- **Duplicate text in tests:** "Project Alpha" and "Project Beta" tenant names appeared in both the tenant selector dropdown AND the All Chats list, causing `getByText` to find multiple elements. Fixed by querying within the `.all-chats-list` container instead.
- **App test failures:** Existing App.test.tsx didn't mock `fetchRecentChannels` which is now called by the `useRecentChannels` hook used in Sidebar. Added the mock.

## Self-Check: PASSED

---
*Plan: 24-01*
*Phase: 24-all-chats-view*
