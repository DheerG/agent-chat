# Phase 20: Auto-archive stale channels - Research

**Researched:** 2026-03-22
**Status:** Complete

## Codebase Analysis

### Existing Archive Infrastructure

**ChannelService** (`packages/server/src/services/ChannelService.ts`):
- `archive(tenantId, channelId, userInitiated)` — archives a single channel
- `restore(tenantId, channelId)` — restores a single channel
- `listActiveByTenant(tenantId)` — returns non-stale, non-archived channels
- `listByTenantWithStale(tenantId)` — returns all non-archived channels with stale boolean

**Channel queries** (`packages/server/src/db/queries/channels.ts`):
- `archiveChannel(tenantId, channelId, userInitiated)` — SQL UPDATE with write queue
- Uses `user_archived` column: `'1'` for user-initiated, `null` for system-initiated
- `getActiveChannelsByTenant` — LEFT JOIN with MAX(messages.created_at) + datetime comparison
- Stale thresholds: session=8h, manual=48h (CASE expression on c.type)

**Key insight**: System-initiated archives (`userInitiated=false`) set `user_archived=null`, which means TeamInboxWatcher's `processTeam` can auto-restore them (it checks `!channel.userArchived`). This is the correct behavior for auto-archive.

### TeamInboxWatcher Integration

**Current `removeTeam` method** (line 312-332 in TeamInboxWatcher.ts):
- Called when `processFileChange` detects team directory no longer exists
- Currently only clears internal state (teams map, lastProcessedIndex, debounce timers)
- Does NOT modify database — comment says "tenant and channel remain for historical access"
- Is a `private` method, synchronous (`void` return)

**What needs to change**:
- Make `removeTeam` async to call `ChannelService.archive()`
- Access team state BEFORE deleting from `this.teams` map (need tenantId and channelId)
- Call `this.services.channels.archive(tenantId, channelId, false)` — system-initiated
- Keep existing cleanup logic (lastProcessedIndex, debounce timers)

### Auto-archive Query Pattern

**New query needed**: Find all session-type channels across ALL tenants where:
1. `archived_at IS NULL` (not already archived)
2. `user_archived IS NULL` or `user_archived != '1'` (not user-archived)
3. Channel type is 'session'
4. Last message is older than 72 hours, OR no messages AND channel created > 72h ago

**SQL pattern** (mirrors existing stale detection):
```sql
SELECT c.id, c.tenant_id
FROM channels c
LEFT JOIN (
  SELECT channel_id, MAX(created_at) as last_activity
  FROM messages
  GROUP BY channel_id
) m ON c.id = m.channel_id
WHERE c.archived_at IS NULL
  AND (c.user_archived IS NULL OR c.user_archived != '1')
  AND c.type = 'session'
  AND (
    (m.last_activity IS NOT NULL AND m.last_activity < datetime('now', '-72 hours'))
    OR (m.last_activity IS NULL AND c.created_at < datetime('now', '-72 hours'))
  )
```

### Server Lifecycle Integration

**index.ts** (server entry point):
- Already has timer-like patterns: `setTimeout` in queue drain during shutdown
- Graceful shutdown sequence: stop watcher -> close WS -> close HTTP -> drain writes -> close DB
- Auto-archive timer needs to be added after server start and cleared before shutdown

**Pattern for periodic cleanup**:
```typescript
// Start after server is running
const archiveInterval = setInterval(() => {
  autoArchiveStaleChannels(services).catch(err => {
    console.error(JSON.stringify({ event: 'auto_archive_error', error: String(err) }));
  });
}, 3600000); // 1 hour

// Initial run with small delay
setTimeout(() => {
  autoArchiveStaleChannels(services).catch(...);
}, 5000); // 5 seconds after startup

// Clear on shutdown
process.once('SIGTERM', () => {
  clearInterval(archiveInterval);
  // ... existing shutdown
});
```

### Test Strategy

**TeamInboxWatcher tests** (`packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts`):
- Uses in-memory SQLite (`:memory:`)
- Has helpers: `createTempTeamsDir`, `writeTeamConfig`, `writeInbox`, `wait`
- Tests team removal: directory disappearance triggers `removeTeam`
- New test: verify channel gets archived when team directory is removed

**Auto-archive tests** (new test file):
- Need to test the query: channels older than 72h get found
- Need to test the periodic function: found channels get archived
- Need to test user-archived channels are NOT touched
- Need to test team (manual) channels are NOT touched by session auto-archive

## Validation Architecture

### What to Verify
1. Session channels inactive 72h+ are auto-archived by periodic cleanup
2. Session channels with no messages and created 72h+ ago are auto-archived
3. User-archived channels are NOT touched by auto-archive
4. Manual/team channels are NOT auto-archived by the periodic cleanup
5. Active session channels (< 72h) are NOT archived
6. Team channel is archived when team directory is deleted
7. Team channel archival is system-initiated (auto-restorable)
8. Periodic timer starts on server startup and stops on shutdown
9. All existing tests pass with zero regressions

### Test Patterns
- Unit tests for the new query (getStaleSessionChannelsForArchival)
- Unit tests for the auto-archive function
- Integration tests for TeamInboxWatcher removeTeam + archive
- Full test suite regression check

---

*Phase: 20-auto-archive-stale-channels*
*Research completed: 2026-03-22*
