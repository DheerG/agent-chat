# Phase 24: All Chats View - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Unified "All Chats" view that shows channels from ALL tenants in a single flat list, sorted by last activity. Includes active, stale, and archived channels. Clicking a channel navigates to it (setting the correct tenant context). This solves the problem of not being able to find a chat when you don't remember which tenant/codebase it was under.

</domain>

<decisions>
## Implementation Decisions

### Sidebar navigation mode
- Add an "All Chats" button/tab at the top of the sidebar, above the tenant switcher
- When active, replaces the per-tenant channel list with the cross-tenant unified list
- Tenant switcher and per-tenant view remain available — "All Chats" is an alternative view, not a replacement
- Clicking a channel from the All Chats list sets both the active tenant and channel, switching back to per-tenant context

### Channel list display
- Flat list sorted by last message timestamp (most recent first)
- Each entry shows: channel name (#name), tenant name as a secondary label, relative timestamp ("2h ago", "3d ago", "just now")
- Archived channels shown with dimmed/muted styling (lower opacity or muted text color)
- Stale channels shown with the existing stale styling (slightly muted but not as dim as archived)
- Channel type indicator not needed — the name already conveys session vs team context

### Backend API
- New endpoint: `GET /api/channels/recent` — returns channels across all tenants
- Joins channels with MAX(messages.created_at) for last activity timestamp
- Joins with tenants table to include tenant name in each result
- Includes all channels: active, stale, and archived
- Returns up to 100 channels by default, sorted by last activity descending (most recent first)
- Channels with no messages sorted by channel created_at
- Response shape: `{ channels: Array<{ ...Channel, tenantName: string, lastActivity: string | null }> }`
- Optional `limit` query param for pagination

### Click behavior
- Clicking a channel from All Chats: sets selectedTenantId + selectedChannelId + subscribes to WebSocket
- Does NOT switch the sidebar back to per-tenant view — stays in All Chats mode so user can continue browsing
- Tenant switcher dropdown updates to reflect the selected tenant for context

### Claude's Discretion
- Exact styling of the All Chats tab/button (active vs inactive state)
- Whether to show message count or last message preview (lean toward simplicity — just timestamp)
- Empty state wording when no channels exist across any tenant
- Whether the relative timestamp updates live or only on refresh

</decisions>

<specifics>
## Specific Ideas

- User explicitly said: "I often can't find an agent chat at all" — this is a findability/navigation problem
- User wants to see "all recent chats from all tenants in one place, archived or not"
- The view should feel like a unified inbox/recents list — think Slack's "All DMs" or a unified notification feed
- Sort by last activity is the primary organization — no grouping by tenant

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sidebar.tsx`: Current sidebar component that manages tenant switcher + channel list — will be extended with All Chats mode
- `useChannels` hook: Existing pattern for fetching and managing channel state — new `useAllChannels` hook follows same pattern
- `fetchJson` utility in `lib/api.ts`: Reusable HTTP fetcher for the new endpoint
- `rawRowToChannel` in channel queries: Pattern for raw SQL result mapping — new cross-tenant query follows same approach
- `ChannelWithStale` type: Existing extended channel type — new `RecentChannel` type extends similarly

### Established Patterns
- Raw SQL queries for complex joins (used in `getActiveChannelsByTenant`, `getChannelsByTenantWithStale`)
- Channel queries return mapped `Channel` objects via `rawRowToChannel`
- Client hooks use `useState`/`useEffect` with `refreshKey` for re-fetching
- API routes registered in `app.ts` with `app.route()`
- Sidebar uses `onChannelSelect(tenantId, channelId)` callback pattern — All Chats reuses this

### Integration Points
- `packages/server/src/db/queries/channels.ts`: New `getRecentChannelsAcrossTenants()` query
- `packages/server/src/services/ChannelService.ts`: New `listRecentAcrossTenants()` method
- `packages/server/src/http/app.ts`: Mount new route at `/api/channels/recent`
- `packages/client/src/lib/api.ts`: New `fetchRecentChannels()` function
- `packages/client/src/hooks/`: New `useRecentChannels` hook
- `packages/client/src/components/Sidebar.tsx`: Add All Chats tab and conditional rendering
- `packages/client/src/App.tsx`: Pass new props for All Chats mode

</code_context>

<deferred>
## Deferred Ideas

- Search/filter within the All Chats list — future phase
- Pinning favorite channels to top of All Chats — future phase
- Keyboard navigation (arrow keys) through the All Chats list — future phase

</deferred>

---

*Phase: 24-all-chats-view*
*Context gathered: 2026-03-27*
