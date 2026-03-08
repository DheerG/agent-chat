# Phase 14: Harden Team Lifecycle - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the archived-team-reuse bug, handle same-name tenant conflicts, and harden the TeamInboxWatcher against ingestion edge cases (directory disappearance, malformed files, rapid create/delete cycles). This is a backend hardening phase — no new features, no UI changes.

</domain>

<decisions>
## Implementation Decisions

### Archived team reuse
- When `upsertByCodebasePath` finds a tenant that is archived, it must automatically restore it (clear `archivedAt`) before returning
- When restoring a tenant, also restore its channels via `channelQ.restoreChannelsByTenant(id)` (same cascade as manual UI restore in Phase 7)
- This ensures the TeamInboxWatcher's `processTeam` flow works transparently — no new API needed, just fix the upsert logic
- The watcher's `listByTenant` call (which filters `archived_at IS NULL`) will then find the existing channel instead of creating a new one

### Same-name tenant conflicts
- The existing approach uses `codebasePath` (team directory path) as the unique key — this already handles same-name teams because different teams have different directory paths
- No additional conflict resolution needed — the `codebasePath` column is the canonical identity, not the `name` column
- If a team is recreated at the same path after being deleted from `~/.claude/teams/`, the archived tenant at that path gets restored (see above)

### Watcher robustness — directory disappearance
- Wrap `readdirSync` calls in `scanTeams` and `processTeamInboxes` with try/catch (already done for `scanTeams`, need to verify `processTeamInboxes`)
- When a team directory disappears mid-read, log a warning and skip — do not crash the watcher
- When `existsSync` returns false for a team path during `processFileChange`, skip silently

### Watcher robustness — malformed inbox files
- Already handled: invalid JSON caught by try/catch in `processInboxFile`
- Already handled: non-array inbox data returns early
- Add: handle partial JSON writes (truncated file) — the existing try/catch covers this
- Add: handle inbox files that are valid JSON but contain non-object entries in the array (e.g., `[null, 42, "string"]`) — skip non-object entries

### Watcher robustness — rapid create/delete cycles
- The 100ms debounce timer already coalesces rapid file changes
- When a team directory is deleted and quickly recreated, the watcher should:
  1. Remove the team from the in-memory `teams` map when its directory disappears
  2. Re-discover and re-process when the directory reappears with a new `config.json`
- Add a `removeTeam(teamName)` method that clears the team from `teams`, `lastProcessedIndex`, and `debounceTimers`
- On `processFileChange`, if the team directory no longer exists, call `removeTeam`

### Watcher robustness — team config updates
- When `config.json` is updated (e.g., new members added), the watcher already re-reads the config
- No additional work needed for config changes

### Claude's Discretion
- Exact error log message format and severity
- Whether to add a periodic re-scan interval (e.g., every 60s) as a safety net for missed fs.watch events
- Test fixture structure for new edge case tests
- Whether `removeTeam` should also clear `seenMessages` entries for that team (tradeoff: memory vs dedup accuracy)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TenantService.upsertByCodebasePath()` (`packages/server/src/services/TenantService.ts`): Core method to modify — add archived tenant detection and auto-restore
- `TenantService.restore()` (`packages/server/src/services/TenantService.ts`): Already implements restore with channel cascade — can be called from upsert
- `TeamInboxWatcher` (`packages/server/src/watcher/TeamInboxWatcher.ts`): Main file to harden with edge case handling
- `createTenantQueries.getTenantByCodebasePath()` (`packages/server/src/db/queries/tenants.ts`): Already returns archived tenants (no `WHERE archived_at IS NULL` filter) — this is correct behavior for the fix

### Established Patterns
- Write serialization via `WriteQueue.enqueue()` — all DB writes go through the queue
- Error handling: try/catch with JSON-structured log lines (`console.error(JSON.stringify({...}))`)
- Service cascade: `TenantService.archive/restore` cascades to channels via `channelQ`
- Dedup via in-memory `Set` with composite keys
- Debounce via `setTimeout` with `Map<string, timer>` pattern

### Integration Points
- `TenantService.upsertByCodebasePath()` — modify to handle archived tenants
- `TeamInboxWatcher.processTeam()` — add team removal on directory disappearance
- `TeamInboxWatcher.processFileChange()` — add directory-gone detection
- `TeamInboxWatcher.processInboxFile()` — harden against non-object array entries

</code_context>

<specifics>
## Specific Ideas

- The key fix is a 3-line change in `upsertByCodebasePath`: check `existing.archivedAt`, call `this.q.restoreTenant(existing.id)` + `this.channelQ.restoreChannelsByTenant(existing.id)`, then return the restored tenant
- The `removeTeam` method should be the inverse of `processTeam` — clear all in-memory state for a team without touching the database
- Edge case tests should cover the full lifecycle: create team -> ingest messages -> archive tenant -> delete team dir -> recreate team dir -> verify messages show in UI

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-harden-team-lifecycle-archived-team-reuse-same-name-conflicts-and-ingestion-edge-cases*
*Context gathered: 2026-03-08*
