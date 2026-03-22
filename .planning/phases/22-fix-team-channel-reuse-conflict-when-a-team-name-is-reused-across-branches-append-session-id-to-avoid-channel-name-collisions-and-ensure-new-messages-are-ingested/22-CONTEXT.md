# Phase 22: Fix team channel reuse conflict — Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the bug where reusing a team name across different branches causes channel name collisions, leading to message dedup conflicts and messages not being ingested. When a DIFFERENT team session uses the same name as a previous (now-deleted) team, the system should create a new channel instead of reusing the old one. Same-team restarts (same session) should still reuse the channel.

</domain>

<decisions>
## Implementation Decisions

### Session identity detection
- Each team config.json contains `createdAt` (epoch ms) and `leadSessionId` (UUID) that uniquely identify a team session
- When processTeam encounters an existing channel by name, compare the team's `createdAt` timestamp against stored metadata on the channel to determine if this is the same session or a different one
- Use `createdAt` as the primary session discriminator — it's always present and changes when a team is recreated, even with the same name

### Channel metadata storage
- Store the team session's `createdAt` value in the channel's `sessionId` field (currently nullable, unused for manual/team channels)
- This avoids schema migration — the field exists but is only used for session-type channels today
- When comparing, if the channel's sessionId matches the team's createdAt, it's the same session — reuse the channel
- If sessionId is null (legacy channels without session tracking) or doesn't match, treat as different session

### Channel naming for new sessions
- When a name conflict exists (different session, same team name), create a new channel with a disambiguated name
- Format: `{teamName}-{n}` where n is an incrementing counter (2, 3, 4, ...)
- Example: first team "eval-1663", second team "eval-1663-2", third team "eval-1663-3"
- The counter is determined by querying existing channels with names matching `{teamName}` or `{teamName}-{n}` pattern
- Human-readable names are preserved — no UUIDs or hashes in channel names

### Dedup state handling
- The `seenMessages` Set is in-memory and global — when a new channel is created for a different session, old dedup keys in memory are irrelevant but harmless (they won't match new messages since content differs)
- The `lastProcessedIndex` Map is keyed by file path — when a team directory is deleted and recreated, the file paths reset naturally
- No explicit dedup state clearing needed for the new session — it gets a fresh channel with no dedup conflicts

### Channel reuse logic (updated processTeam flow)
1. Read config.json, extract `createdAt` as session identifier
2. Find existing channel by name (`findByName`)
3. If channel found AND channel.sessionId matches config.createdAt → reuse (same session continuing)
4. If channel found AND channel.sessionId does NOT match → create new channel with disambiguated name, store createdAt as sessionId
5. If no channel found → create new channel with original name, store createdAt as sessionId
6. Auto-restore logic remains: if reusing an archived channel (same session), restore it

### Claude's Discretion
- Exact implementation of the channel name disambiguation query (SQL LIKE vs multiple queries)
- Whether to also store leadSessionId in channel metadata for additional verification
- Test structure and organization
- Log message formatting for session conflict detection events

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChannelService.findByName(tenantId, name)` — finds channel by exact name, returns Channel or null
- `channels.sessionId` field — exists in schema, nullable, currently unused for manual/team channels
- `TeamConfig.createdAt` — epoch timestamp present in every team config, unique per session
- `TeamConfig.leadSessionId` — UUID present in team configs, another unique session identifier

### Established Patterns
- `processTeam` already does findByName + auto-restore pattern (Phase 17/21)
- Channel creation via `ChannelService.create(tenantId, { name, type: 'manual' })` — already accepts sessionId
- `TeamState` interface stores tenantId, channelId, config — config contains createdAt
- In-memory dedup via `seenMessages` Set with `from|timestamp|hash(text)` keys

### Integration Points
- `TeamInboxWatcher.processTeam()` — primary change point for session detection and channel routing
- `ChannelService.create()` — needs to pass sessionId for new team channels
- `ChannelService.findByName()` — may need a companion method or the caller handles the session comparison
- `getChannelByName` SQL query — may need extension to find channels by name pattern for disambiguation
- Channel queries — may need a new query to find channels matching a name prefix pattern

</code_context>

<specifics>
## Specific Ideas

- The actual bug report references team "eval-1663" in project "skipup" — the config.json shows `createdAt: 1774192564782` and `leadSessionId: 144bff0c-f747-4ba3-8e6e-e95663221279`
- The user's scenario: create branch, start team, stop team, delete branch, create new branch, start team with same name — new messages not ingested
- Old channel messages from previous team sessions should remain visible in the archived channel
- The fix must be backward-compatible: existing channels without sessionId should still work (treated as legacy, new session creates disambiguated name)

</specifics>

<deferred>
## Deferred Ideas

- Channel linking/grouping UI — show related channels (same team name, different sessions) together in the sidebar
- Channel migration — option to move messages from old session channel to new one
- Automatic cleanup of old disambiguated channels after extended inactivity

</deferred>

---

*Phase: 22-fix-team-channel-reuse-conflict*
*Context gathered: 2026-03-22*
