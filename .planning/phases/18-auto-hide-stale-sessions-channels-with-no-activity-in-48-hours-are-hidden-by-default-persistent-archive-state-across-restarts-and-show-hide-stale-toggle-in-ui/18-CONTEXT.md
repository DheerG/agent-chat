# Phase 18: Auto-hide Stale Sessions - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-hide channels with no activity in 48 hours by default. Persist archive state across server restarts (currently the TeamInboxWatcher auto-restore undoes manual archives). Add a "show/hide stale" toggle in the sidebar UI so hidden stale channels can be revealed on demand.

</domain>

<decisions>
## Implementation Decisions

### Stale channel definition
- A channel is "stale" if its most recent message (MAX(messages.created_at)) is older than 48 hours, OR it has zero messages
- Channels with zero messages are always considered stale (they are empty sessions that never had team discussion)
- The 48-hour threshold is computed at query time using the current timestamp — no cron job or background process needed
- The `updated_at` field on channels is NOT reliable for staleness (it reflects channel metadata changes, not message activity), so use MAX(messages.created_at) instead

### Stale vs. archived distinction
- "Stale" is a computed, time-based status — channels become stale automatically after 48 hours of inactivity
- "Archived" is an explicit user action — channels are archived manually via the sidebar archive button
- Stale channels are hidden by default but can be shown with a toggle; archived channels remain in the Archived section
- A channel can be both stale AND archived — archived takes precedence (stays in Archived section, not shown in stale toggle)

### Persistent archive state across restarts
- The root cause: TeamInboxWatcher.processTeam calls ChannelService.findByName + restore, which undoes user-initiated archives when the server restarts and re-processes team directories
- Fix: Add a `manually_archived` boolean column (or use the existing `archived_at` semantics) to distinguish "user explicitly archived this" from "system archived this"
- Approach: Do NOT add a new column. Instead, change the auto-restore logic in TeamInboxWatcher.processTeam to NOT restore channels that were manually archived. The channel already has `archived_at` — if it is set, the watcher should skip it rather than restoring it
- The tenant-level auto-restore in TenantService.upsertByCodebasePath should also respect this: if a tenant was manually archived, the watcher should not auto-restore it
- Key change: TeamInboxWatcher should only CREATE new channels if they don't exist, and only restore channels that were auto-archived by the system (not manually archived by the user)
- Implementation: Add a `user_archived` boolean column to channels and tenants tables (default false). When a user archives via the UI, set `user_archived = true`. The auto-restore logic checks this flag and skips restoration if `user_archived = true`. When a user restores, set `user_archived = false`.

### Sidebar stale toggle
- Add a toggle button in the sidebar channel list header area, labeled "Show stale" / "Hide stale" (or an eye icon toggle)
- Default state: stale channels hidden (toggle says "Show stale")
- When toggled on: stale channels appear in the channel list with a muted/dimmed visual style to distinguish them from active channels
- Toggle state persists in localStorage (same pattern as selected tenant)
- The toggle only affects the current tenant's channel list view

### Server-side stale computation
- Add a new API endpoint or modify the existing GET /api/tenants/:tenantId/channels to accept a `?include_stale=true` query parameter
- Default behavior (no param or `include_stale=false`): return only non-stale, non-archived channels
- With `include_stale=true`: return all non-archived channels, with a `stale` boolean field on each channel indicating whether it's stale
- The stale computation is a SQL query joining channels with MAX(messages.created_at) and comparing to NOW() - 48 hours
- This avoids breaking existing consumers that expect only active channels

### Claude's Discretion
- Exact visual styling for stale channels in the sidebar (muted opacity, italic text, gray color, etc.)
- Toggle button icon/design details
- Whether to show a count of hidden stale channels (e.g., "+3 stale") next to the toggle
- Exact SQL query optimization for the stale computation (subquery vs JOIN vs CTE)
- Whether empty channels (zero messages) should be visually distinguished from stale channels that had old messages

</decisions>

<specifics>
## Specific Ideas

- User explicitly said "anything which is over 48 hours should be hidden by default" — this is the primary UX requirement
- User said "sessions which don't have any team discussions" are clutter — empty channels should be hidden
- User wants "show and hide stale" as the toggle concept — not "show inactive" or "show old"
- The term "stale" should be used in the UI
- Archive state must survive server restarts — this is a bug fix, not a new feature

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChannelService`: Already has `listByTenant`, `listArchivedByTenant`, `findByName`, `archive`, `restore` — extend with stale-aware query
- `useChannels` hook: Already fetches channels for a tenant — extend to pass `include_stale` parameter
- `fetchChannels` in `lib/api.ts`: Already calls GET channels endpoint — add query param support
- `localStorage` persistence pattern: Used for selected tenant in App.tsx — reuse for stale toggle state
- `ConfirmDialog` component: Available if needed for any confirmation flows
- CSS custom properties (design tokens): All new colors should go on `:root` in App.css

### Established Patterns
- Raw SQL queries for IS NULL/IS NOT NULL (Drizzle ORM compatibility): Use raw SQL for the stale join query
- `refreshKey` pattern: Used to trigger re-fetches after archive/restore mutations
- Idempotent migrations with try/catch ALTER TABLE: For adding the `user_archived` column
- Service layer wraps queries: ChannelService wraps channel queries, TenantService wraps tenant queries

### Integration Points
- `packages/server/src/db/index.ts`: Add migration for `user_archived` column on channels and tenants
- `packages/server/src/db/queries/channels.ts`: Add stale-aware query, update archive/restore to set `user_archived`
- `packages/server/src/services/ChannelService.ts`: Add `listByTenantWithStale` method
- `packages/server/src/http/routes/channels.ts`: Modify GET / to accept `include_stale` query param
- `packages/server/src/watcher/TeamInboxWatcher.ts`: Change auto-restore to respect `user_archived` flag
- `packages/server/src/services/TenantService.ts`: Change `upsertByCodebasePath` to respect `user_archived` flag
- `packages/client/src/components/Sidebar.tsx`: Add stale toggle and stale channel rendering
- `packages/client/src/hooks/useChannels.ts`: Accept and pass `includeStale` parameter
- `packages/client/src/lib/api.ts`: Add `include_stale` query param to `fetchChannels`
- `packages/shared/src/types.ts`: Extend Channel interface with optional `stale` field

</code_context>

<deferred>
## Deferred Ideas

- Auto-delete channels that have been stale for over 30 days (permanent cleanup)
- Configurable staleness threshold (instead of hardcoded 48 hours)
- Bulk archive/delete stale channels action
- Notification when a channel becomes stale

</deferred>

---

*Phase: 18-auto-hide-stale-sessions*
*Context gathered: 2026-03-22*
