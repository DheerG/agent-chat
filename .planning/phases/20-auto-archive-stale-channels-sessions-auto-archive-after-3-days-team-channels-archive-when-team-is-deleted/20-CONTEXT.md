# Phase 20: Auto-archive stale channels — sessions auto-archive after 3 days, team channels archive when team is deleted - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Two auto-archive mechanisms that prevent stale channels from crowding the stale window:

1. **Session channels auto-archive after 3 days** — A periodic server-side cleanup that archives session-type channels whose newest message is older than 72 hours (3 days). These move from "stale" to "archived" automatically.

2. **Team channels archive when team is deleted** — When the TeamInboxWatcher detects a team directory has been removed/deleted, it archives the corresponding channel (currently `removeTeam` only clears internal state).

</domain>

<decisions>
## Implementation Decisions

### Session auto-archive timing
- Archive session channels after 72 hours (3 days) of inactivity
- Measured from the most recent message timestamp (same approach as stale detection)
- Channels with NO messages at all should also be archived after 72 hours from creation
- Only archive channels NOT already user-archived (avoid touching user-managed state)
- System-initiated archive (userInitiated=false) so TeamInboxWatcher can auto-restore if needed

### Periodic cleanup mechanism
- Server-side setInterval timer that runs on a fixed schedule
- Run every hour (3600000ms) — balances responsiveness with resource usage
- First run on server startup (with small delay to let other services initialize)
- Timer cleared on graceful shutdown (added to SIGTERM handler)
- Operates across ALL tenants — not tenant-scoped

### Team channel archival on deletion
- When `removeTeam` detects a team directory is gone, archive the team's channel
- Use existing `ChannelService.archive(tenantId, channelId, false)` — system-initiated, not user-initiated
- This allows auto-restore if the team reappears (existing Phase 17 behavior)
- Log the archive action for observability

### Claude's Discretion
- Exact delay before first cleanup run on startup
- Query optimization approach for the bulk stale check
- Whether to add a new query method or reuse/adapt existing stale detection queries
- Log format and verbosity for auto-archive events

</decisions>

<specifics>
## Specific Ideas

- User explicitly stated sessions are useless after a few hours and "absolutely no idea what they are" — aggressive auto-archival is welcome
- Active codebases may have ~50 channels with only 2 being relevant — auto-archive should dramatically reduce clutter
- The stale window itself should become cleaner — things should "fall off from stale and get archived automatically"
- Session auto-archive is uncontroversial ("I think it's fine auto-archiving sessions because again, they are sessions")
- Team channel archival tied to team deletion is straightforward ("with the teams, let's archive them when the teams get deleted")

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChannelService.archive(tenantId, channelId, userInitiated)` — existing archive method, supports userInitiated flag
- `getActiveChannelsByTenant` / `getChannelsByTenantWithStale` — existing stale detection queries with type-aware thresholds (session=8h, manual=48h)
- `archiveChannel` query — raw SQL with write queue, already handles `user_archived` column
- `TeamInboxWatcher.removeTeam()` — currently only clears internal state, needs to also archive channel

### Established Patterns
- Stale detection uses LEFT JOIN with MAX(messages.created_at) and datetime comparisons — same pattern should be used for auto-archive query
- System-initiated archives use `userInitiated=false` so auto-restore can bring them back
- Write operations go through WriteQueue for serialization
- Server-side services are wired in `index.ts` with startup/shutdown lifecycle

### Integration Points
- New auto-archive service/function needs access to `Services` (channels, tenants)
- Timer lifecycle managed in `packages/server/src/index.ts` (start after server, clear on SIGTERM)
- `TeamInboxWatcher.removeTeam()` needs to be made async and call `ChannelService.archive()`
- New query needed: find all session channels inactive for 72+ hours across all tenants (not tenant-scoped like existing queries)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-auto-archive-stale-channels-sessions-auto-archive-after-3-days-team-channels-archive-when-team-is-deleted*
*Context gathered: 2026-03-22*
