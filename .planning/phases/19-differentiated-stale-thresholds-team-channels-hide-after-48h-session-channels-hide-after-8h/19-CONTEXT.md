# Phase 19: Differentiated Stale Thresholds - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the stale channel detection channel-type-aware: team channels (type='manual') use a 48-hour stale threshold, session channels (type='session') use an 8-hour stale threshold. The Phase 18 infrastructure (stale detection queries, include_stale param, sidebar toggle) already works — this phase only changes the threshold logic to be per-channel-type instead of a flat 48 hours.

</domain>

<decisions>
## Implementation Decisions

### Threshold by channel type
- Channels with `type = 'session'` (created by Claude Code hooks) go stale after 8 hours of no messages
- Channels with `type = 'manual'` (created by TeamInboxWatcher for agent team chats) go stale after 48 hours of no messages
- Channels with zero messages remain always stale regardless of type (existing behavior)
- Thresholds are applied in the SQL queries at query time — no schema migration needed

### SQL query changes
- Both `getActiveChannelsByTenant` and `getChannelsByTenantWithStale` need CASE-based threshold logic
- The CASE expression switches on `c.type`: `WHEN 'session' THEN datetime('now', '-8 hours')` and `WHEN 'manual' THEN datetime('now', '-48 hours')`
- No new columns, no new tables, no migration needed — purely query logic changes

### No API changes
- The `include_stale` query parameter and response shape remain unchanged
- The `stale` boolean field on channels still works the same way — just computed with type-aware thresholds
- No client-side API changes needed

### No UI changes
- The sidebar stale toggle, dimmed styling, and stale count all work as-is
- The only visible difference is that more session channels will be hidden (8h vs 48h threshold)

### Claude's Discretion
- Whether to extract threshold constants (e.g., `SESSION_STALE_HOURS = 8`, `TEAM_STALE_HOURS = 48`) or keep them inline in SQL
- Test structure and organization

</decisions>

<specifics>
## Specific Ideas

- User explicitly said: "Agent team chats, I want them to be at 48 hours. Sessions, I want you to hide anything where the newest messages are older than 8 hours."
- The channel `type` field already distinguishes the two: `'session'` vs `'manual'`
- This is a surgical change to two SQL queries — minimal risk, no schema migration

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `channels.ts` queries: `getActiveChannelsByTenant` and `getChannelsByTenantWithStale` — both have hardcoded `'-48 hours'` that needs to become type-aware
- Channel `type` field: Already `'session' | 'manual'` in schema and TypeScript types
- ChannelService: Thin wrapper, no changes needed — it delegates to queries

### Established Patterns
- Raw SQL queries with `rawDb.prepare()` for stale detection (Drizzle ORM compatibility)
- CASE expressions already used in `getChannelsByTenantWithStale` for the `is_stale` flag
- Integration tests in `channels.test.ts` already test stale detection behavior

### Integration Points
- `packages/server/src/db/queries/channels.ts`: Lines 150-192 — the two queries to modify
- `packages/server/src/http/__tests__/channels.test.ts`: Existing stale tests to extend with type-aware cases
- No client-side changes needed — the stale boolean is computed server-side

</code_context>

<deferred>
## Deferred Ideas

- Configurable stale thresholds via environment variables or API settings
- Per-tenant customizable thresholds
- Visual distinction between "session stale" and "team stale" in the sidebar

</deferred>

---

*Phase: 19-differentiated-stale-thresholds*
*Context gathered: 2026-03-22*
