# Phase 24: All Chats View - Research

**Researched:** 2026-03-27
**Status:** Complete

## Codebase Analysis

### Database Layer

The SQLite schema (`packages/shared/src/schema.ts`) has:
- `channels` table with `tenant_id`, `name`, `type`, `archived_at`, `user_archived` columns
- `messages` table with `channel_id`, `tenant_id`, `created_at` columns
- `tenants` table with `id`, `name`, `archived_at` columns
- Existing index: `idx_channels_tenant` on `channels.tenantId`
- Existing index: `idx_messages_tenant_channel` on `messages(tenantId, channelId, id)`

The cross-tenant query needs to JOIN channels with a messages subquery (MAX(created_at)) and tenants (for name). This pattern already exists in `getChannelsByTenantWithStale` and `getStaleSessionChannelsForArchival` — both use LEFT JOIN with MAX(messages.created_at) grouped by channel_id.

### Query Layer (`packages/server/src/db/queries/channels.ts`)

Existing patterns:
- `rawDb.prepare(SQL).all()` for read queries returning arrays
- `rawRowToChannel()` for mapping raw SQL rows to Channel objects
- Raw SQL is used for complex joins (not Drizzle ORM) — established in Phase 7
- `getStaleSessionChannelsForArchival()` already queries across all tenants (no tenantId filter)

New query `getRecentChannelsAcrossTenants(limit)` needs:
```sql
SELECT c.*, t.name as tenant_name, m.last_activity
FROM channels c
JOIN tenants t ON c.tenant_id = t.id
LEFT JOIN (
  SELECT channel_id, MAX(created_at) as last_activity
  FROM messages
  GROUP BY channel_id
) m ON c.id = m.channel_id
ORDER BY COALESCE(m.last_activity, c.created_at) DESC
LIMIT ?
```

Key: Include ALL channels (active + archived). Sort by last message time, falling back to channel creation time. Join tenants for name.

### Service Layer (`packages/server/src/services/ChannelService.ts`)

Simple delegation pattern — each service method maps to a query method. New method: `listRecentAcrossTenants(limit?: number)`.

### HTTP Routes (`packages/server/src/http/routes/channels.ts`)

Currently all channel routes are scoped under `/api/tenants/:tenantId/channels`. The new endpoint `/api/channels/recent` is NOT tenant-scoped, so it needs its own route file or to be mounted directly in `app.ts`.

**Decision:** Create a new route file `packages/server/src/http/routes/allChannels.ts` mounted at `/api/channels` in `app.ts`. This keeps it separate from tenant-scoped channel routes.

**IMPORTANT:** Must register `/api/channels` route BEFORE `/api/tenants/:tenantId/channels` in `app.ts` to avoid route conflicts. Actually, since Hono uses path-based routing, `/api/channels/recent` won't conflict with `/api/tenants/:tenantId/channels` because the paths are completely different. No ordering concern.

### Client API (`packages/client/src/lib/api.ts`)

Uses `fetchJson<T>()` helper. New function:
```typescript
export async function fetchRecentChannels(limit?: number): Promise<RecentChannel[]>
```

### Client Hook Pattern (`packages/client/src/hooks/useChannels.ts`)

Standard pattern: `useState` + `useEffect` with `refreshKey` dependency. New `useRecentChannels(refreshKey)` hook follows same pattern.

### Sidebar Component (`packages/client/src/components/Sidebar.tsx`)

Currently receives `selectedTenantId` and renders channels for that tenant. Need to:
1. Add a view mode toggle (per-tenant vs all-chats)
2. When in all-chats mode, hide tenant switcher's channel list and show cross-tenant list instead
3. Each channel item needs tenant name label and relative timestamp

### App Component (`packages/client/src/App.tsx`)

`handleChannelSelect(tenantId, channelId)` already sets both tenant and channel. The All Chats view can reuse this callback directly — each recent channel entry includes `tenantId`, so clicking it calls `handleChannelSelect(channel.tenantId, channel.id)`.

### Shared Types (`packages/shared/src/types.ts`)

Need new type:
```typescript
export interface RecentChannel extends Channel {
  tenantName: string;
  lastActivity: string | null;
}
```

## Validation Architecture

### Test Strategy

**Server tests:**
1. Query test: `getRecentChannelsAcrossTenants` returns channels from multiple tenants, sorted by last activity
2. Query test: channels with no messages use `created_at` for sorting
3. Query test: respects limit parameter
4. Query test: includes archived channels
5. Route test: `GET /api/channels/recent` returns correct response shape
6. Route test: `GET /api/channels/recent?limit=5` respects limit

**Client tests:**
1. Sidebar test: "All Chats" button renders and toggles view mode
2. Sidebar test: All Chats list renders channel name + tenant name + relative time
3. Sidebar test: clicking a channel calls `onChannelSelect` with correct tenantId and channelId
4. Sidebar test: archived channels have dimmed styling

### Risk Assessment

- **Low risk:** Database query is straightforward extension of existing patterns
- **Low risk:** Route addition doesn't affect existing routes
- **Low risk:** Sidebar extension is additive — existing per-tenant view untouched
- **Medium risk:** Relative timestamp formatting — need a utility function (no external dependency needed, can use simple math on Date objects)

## RESEARCH COMPLETE
