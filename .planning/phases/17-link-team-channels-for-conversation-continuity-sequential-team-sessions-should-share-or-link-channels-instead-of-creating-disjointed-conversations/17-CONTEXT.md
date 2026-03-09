# Phase 17: Link Team Channels for Conversation Continuity - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

When a team with the same name reappears in the same tenant (codebase), reuse the existing channel instead of creating a new one. If the existing channel is archived, restore it. All messages from sequential team sessions should appear in one continuous conversation thread.

</domain>

<decisions>
## Implementation Decisions

### Channel Reuse Strategy
- Add a `findByName(tenantId, name)` query to channel queries that searches ALL channels (including archived) for a given tenant+name combination
- Add a `findByName` method to ChannelService that wraps this query
- TeamInboxWatcher.processTeam() should use `findByName` instead of filtering `listByTenant` results
- If a matching channel is found and it is archived, restore it before reuse

### Archived Channel Restoration
- When processTeam() finds an archived channel matching the team name, call channelService.restore() to unarchive it
- This mirrors the pattern already used in TenantService.upsertByCodebasePath for auto-restoring archived tenants
- No new channel should ever be created if one with the same name exists in that tenant (active or archived)

### No Schema Changes
- The existing channels table schema already supports this — no migrations needed
- The fix is purely in the query/service/watcher layers

### Claude's Discretion
- Whether to add an `upsertByName` convenience method vs keeping find + restore + create as separate calls
- Test structure and coverage approach
- Logging format for channel reuse vs creation events

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TenantService.upsertByCodebasePath`: Already implements the upsert pattern with auto-restore of archived records — this is the exact pattern to follow for channels
- `ChannelService.restore(tenantId, channelId)`: Already exists, can be called when an archived channel is found
- `channels.ts` query layer: Has rawDb access for raw SQL queries (used for IS NULL/IS NOT NULL patterns due to Drizzle 0.45.1 compatibility)

### Established Patterns
- Raw SQL for IS NULL/IS NOT NULL queries (Phase 7 decision, Drizzle ORM compatibility)
- Write queue for all mutation operations
- `rawRowToChannel` converter for raw SQL results
- ChannelService delegates to ChannelQueries, which uses the write queue

### Integration Points
- `TeamInboxWatcher.processTeam()` (lines 170-178): Currently uses `listByTenant().find()` — needs to use new `findByName` instead
- `ChannelService`: Needs new `findByName` method
- `channels.ts` queries: Needs new `getChannelByName` query that includes archived channels
- No UI changes needed — the fix is entirely backend

</code_context>

<specifics>
## Specific Ideas

- The fix follows the same pattern as TenantService.upsertByCodebasePath: find existing (including archived), restore if archived, create only if not found
- The existing processTeam() code at line 171-178 already attempts to find by name, but uses listByTenant which filters out archived channels — the fix is surgical
- processTeam should also clear stale lastProcessedIndex entries for the reused channel to handle the case where the watcher had previous state from an earlier session

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-link-team-channels-for-conversation-continuity*
*Context gathered: 2026-03-09*
