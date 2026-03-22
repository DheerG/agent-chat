# Phase 22: Fix team channel reuse conflict — Research

## RESEARCH COMPLETE

### Bug Root Cause Analysis

**The exact bug flow:**

1. User creates branch A, starts team "eval-1663" in project "skipup"
2. `processTeam("eval-1663", teamPath)` calls `findByName(tenantId, "eval-1663")` → no channel found → creates new channel named "eval-1663"
3. Messages are ingested into this channel. `seenMessages` Set accumulates dedup keys.
4. User stops team, deletes branch A
5. `removeTeam("eval-1663")` archives the channel, clears `lastProcessedIndex` entries, clears internal team state from `this.teams` Map. But `seenMessages` is NOT cleared.
6. User creates branch B, starts NEW team also named "eval-1663" in same project
7. `processTeam("eval-1663", teamPath)` calls `findByName(tenantId, "eval-1663")` → finds OLD archived channel → restores it
8. **Bug**: The old channel is reused. The `seenMessages` Set still has keys from old session. New messages with different content will pass dedup, BUT the old channel's message history is mixed with the new team's messages, creating confusion. More critically, if the new team has messages with the same `from|timestamp|hash` patterns (unlikely but possible), they'll be silently dropped.

**The deeper issue**: `findByName` does exact name match and returns the first channel. There's no session discrimination. The Phase 17 design assumed same-name = same-team, which is true for sequential restarts of the same branch but false for different branches.

### Key Code Investigation

#### Team config.json structure
Every team session has a `config.json` with these unique identifiers:
- `createdAt`: epoch milliseconds (e.g., `1774192564782`) — always present, unique per team creation
- `leadSessionId`: UUID (e.g., `"144bff0c-f747-4ba3-8e6e-e95663221279"`) — always present, unique per session

These change every time a team is created, even with the same name. They are the perfect discriminators.

#### Channel schema
The `channels` table already has a `sessionId` field:
```sql
session_id TEXT  -- nullable, currently only used for session-type channels
```
For `type='manual'` (team channels), `sessionId` is always `null`. This field can be repurposed to store the team's `createdAt` as a session discriminator without schema migration.

#### ChannelService.create()
Already accepts `sessionId` in the data parameter:
```typescript
async create(tenantId: string, data: { name: string; sessionId?: string; type?: 'session' | 'manual' }): Promise<Channel>
```
No changes needed to the service create method.

#### ChannelService.findByName()
Currently does exact name match:
```typescript
findByName(tenantId: string, name: string): Channel | null
```
Returns the first channel with that exact name. For the fix, we need an additional query to find channels by name prefix pattern for disambiguation.

#### Dedup state (seenMessages)
The `seenMessages` Set is never cleared per-team — it's global to the watcher instance. When a new channel is created for a different session, old dedup keys are harmless because:
1. New team messages will have different `from|timestamp|hash(text)` combinations
2. Even if by chance some match, the channel is different so messages go to the right place

The real issue is channel reuse, not dedup state.

### Required Changes

#### 1. TeamInboxWatcher.processTeam() — core fix
**Current flow:**
```
findByName(tenantId, teamName)
  → found? restore + reuse
  → not found? create new
```

**New flow:**
```
Read config.createdAt as sessionId
findByName(tenantId, teamName)
  → found AND channel.sessionId === String(config.createdAt)? → same session, reuse (restore if archived)
  → found AND channel.sessionId !== String(config.createdAt)? → different session, create new with disambiguated name
  → not found? → create new with original name
Store config.createdAt as sessionId when creating channel
```

#### 2. Channel name disambiguation
When creating a new channel for a different session with a conflicting name:
- Query for all channels matching pattern `{teamName}` or `{teamName}-{N}`
- Pick the next available number: `{teamName}-2`, `{teamName}-3`, etc.
- Need a new query: `getChannelsByNamePrefix(tenantId, namePrefix)` — or simpler: `getNextChannelName(tenantId, baseName)` that counts existing

#### 3. New query: getChannelsByNamePrefix
```sql
SELECT name FROM channels WHERE tenant_id = ? AND (name = ? OR name LIKE ? || '-%')
```
This finds all channels with names like "eval-1663", "eval-1663-2", "eval-1663-3" etc. to determine the next available suffix.

#### 4. Also clear seenMessages per team on removeTeam
While not strictly required (dedup keys from old sessions are harmless for new channels), it's good hygiene to clear dedup keys when a team is removed. This prevents unbounded memory growth.

### Files to Modify

1. **`packages/server/src/watcher/TeamInboxWatcher.ts`** — Main fix: session detection in processTeam, seenMessages cleanup in removeTeam
2. **`packages/server/src/db/queries/channels.ts`** — New query: getChannelsByNamePrefix
3. **`packages/server/src/services/ChannelService.ts`** — New method: findByNamePrefix or getNextDisambiguatedName
4. **`packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts`** — Tests for session conflict detection, disambiguation, dedup cleanup

### Edge Cases

1. **Legacy channels with null sessionId**: Treat as "unknown session" — if a new team appears with same name, create a disambiguated channel. This is safe because legacy channels were created before session tracking.
2. **Multiple conflicts**: Team created 3 times with same name → channels: "eval-1663", "eval-1663-2", "eval-1663-3"
3. **Same session restart**: Same team (same createdAt) restarting → reuse existing channel (existing Phase 17 behavior preserved)
4. **Server restart**: `seenMessages` Set resets, but `lastProcessedIndex` also resets, so all messages get re-processed. The dedup in the database level (message content) prevents true duplicates.

### Validation Architecture

**Unit tests:**
- processTeam with same name, different createdAt → creates new channel with suffix
- processTeam with same name, same createdAt → reuses existing channel
- Channel name disambiguation: "team-2", "team-3" numbering
- Legacy channel (sessionId=null) + new team → new channel created
- seenMessages cleanup on removeTeam

**Integration test pattern:**
1. Create team → verify channel created with sessionId
2. Remove team → verify channel archived
3. Create team with same name, different createdAt → verify NEW channel created with "-2" suffix
4. Verify messages in new channel, old channel messages preserved
