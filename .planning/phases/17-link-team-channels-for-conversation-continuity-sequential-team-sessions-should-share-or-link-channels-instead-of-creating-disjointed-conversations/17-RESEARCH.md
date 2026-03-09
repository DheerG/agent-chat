# Phase 17: Link Team Channels for Conversation Continuity — Research

**Completed:** 2026-03-09
**Status:** Complete

## Summary

This phase fixes a conversation continuity bug where sequential team sessions with the same name create separate channels instead of reusing the existing one.

## Current Architecture

### Channel Lookup Flow in TeamInboxWatcher.processTeam()

```
processTeam(teamName, teamPath)
  ├── Read config.json
  ├── Extract codebasePath from members[].cwd (or fallback to teamPath)
  ├── tenantService.upsertByCodebasePath(name, codebasePath)
  │     └── Auto-restores archived tenant + channels (Phase 14)
  ├── channelService.listByTenant(tenantId)
  │     └── SQL: WHERE tenant_id = ? AND archived_at IS NULL  ← BUG
  ├── channels.find(c => c.name === teamName)
  └── If not found → channelService.create(tenantId, { name: teamName })
```

### The Bug

`listByTenant()` filters out archived channels (`archived_at IS NULL`). When a channel has been archived (either individually via UI or as a side-effect that wasn't fully restored), `processTeam` cannot find it and creates a new channel. This splits the conversation history.

### Scenarios Where This Occurs

1. **User manually archives a team channel** from the UI, then the team restarts
2. **Edge case in tenant restore**: If `restoreChannelsByTenant` fails silently or is not called
3. **Channel name collision**: A channel with the same name exists but is archived

## Solution Design

### New Query: getChannelByName (includes archived)

```typescript
getChannelByName(tenantId: string, name: string): Channel | null {
  const row = rawDb.prepare(
    'SELECT id, tenant_id, name, session_id, type, created_at, updated_at, archived_at FROM channels WHERE tenant_id = ? AND name = ? LIMIT 1'
  ).get(tenantId, name) as ChannelRawRow | undefined;
  return row ? rawRowToChannel(row) : null;
}
```

This query intentionally does NOT filter by `archived_at IS NULL` — it finds any channel with the given name, regardless of archive status.

### New Service Method: findByName

```typescript
findByName(tenantId: string, name: string): Channel | null {
  return this.q.getChannelByName(tenantId, name);
}
```

### Modified processTeam() Logic

```typescript
// Find existing channel (including archived ones)
let channel = this.services.channels.findByName(tenant.id, teamName);
if (channel) {
  // Restore if archived
  if (channel.archivedAt) {
    await this.services.channels.restore(tenant.id, channel.id);
    channel = { ...channel, archivedAt: null };
  }
} else {
  channel = await this.services.channels.create(tenant.id, {
    name: teamName,
    type: 'manual',
  });
}
```

## Validation Architecture

### Test Strategy

1. **Unit test for getChannelByName query**: Verify it finds channels regardless of archive status
2. **Unit test for ChannelService.findByName**: Verify service method delegates correctly
3. **Integration test for processTeam archived channel reuse**: Archive a team's channel, restart watcher, verify same channel ID is reused
4. **Integration test for continuous conversation**: Messages before and after archival appear in the same channel

### Existing Test Infrastructure

- Framework: vitest
- Quick run: `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts`
- Full suite: `cd packages/server && npx vitest run`
- Existing tests: 178 server tests across all packages

### Files Modified

| File | Change |
|------|--------|
| `packages/server/src/db/queries/channels.ts` | Add `getChannelByName` query |
| `packages/server/src/services/ChannelService.ts` | Add `findByName` method |
| `packages/server/src/watcher/TeamInboxWatcher.ts` | Use `findByName` + auto-restore in `processTeam` |
| `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` | Add archived channel reuse tests |

## Risk Assessment

- **Low risk**: No schema changes, no migration needed
- **Low risk**: Follows established patterns (upsert, auto-restore)
- **Low risk**: Only 4 files modified, all in server package
- **Backward compatible**: Existing non-archived channels continue to work identically

---

*Phase: 17-link-team-channels*
*Research completed: 2026-03-09*
