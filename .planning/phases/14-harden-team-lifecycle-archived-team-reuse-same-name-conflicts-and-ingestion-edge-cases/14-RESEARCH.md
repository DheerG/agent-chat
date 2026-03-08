# Phase 14: Harden Team Lifecycle — Research

**Completed:** 2026-03-08
**Researcher:** orchestrator (inline — no external research needed)

## Research Summary

Phase 14 is a backend hardening/bugfix phase. All problems are well-understood and the fixes are localized to two files. No external library research needed.

## Problem Analysis

### 1. Archived Team Reuse Bug

**Root cause:** `TenantService.upsertByCodebasePath()` (line 11-21 in TenantService.ts) calls `getTenantByCodebasePath()` which returns ANY tenant matching the path — including archived ones. When the tenant is archived, the method returns it as-is without restoring it. Downstream, `ChannelService.listByTenant()` filters `WHERE archived_at IS NULL`, so the existing channel is invisible, and the watcher creates a duplicate.

**Fix:** In `upsertByCodebasePath`, check `existing.archivedAt`. If non-null, call `restoreTenant(id)` and `restoreChannelsByTenant(id)` before returning. The restore logic already exists in `TenantService.restore()` — we can reuse the same query methods.

**Code path:**
```
TeamInboxWatcher.processTeam()
  → services.tenants.upsertByCodebasePath(name, path)
    → getTenantByCodebasePath(path)  // returns archived tenant
    → [BUG] returns it as-is, still archived
  → services.channels.listByTenant(tenantId)
    → WHERE archived_at IS NULL  // finds nothing!
  → services.channels.create()  // creates duplicate channel
```

### 2. Same-Name Tenant Conflicts

**Finding:** Not actually a problem. The `codebasePath` column is the unique key, not `name`. Two teams with the same name but different directories get different codebasePaths and thus different tenants. This is correct behavior.

### 3. TeamInboxWatcher Robustness Gaps

**Gap 1: Team directory disappearance**
- `processTeamInboxes` reads from `this.teamsDir + teamName + '/inboxes'` — if the team directory is deleted mid-operation, `readdirSync` throws. Already has try/catch.
- `processFileChange` checks `existsSync(join(teamPath, 'config.json'))` for new teams, but does NOT handle the case where a known team's directory disappears. The team stays in `this.teams` forever.
- **Fix:** Add `removeTeam(teamName)` method. In `processFileChange`, if a known team's directory no longer exists, call `removeTeam`.

**Gap 2: Non-object array entries in inbox**
- `processInboxFile` iterates messages and checks `if (!msg || !msg.from || !msg.timestamp || msg.text == null)` — this handles null entries but could fail if an entry is a non-object (e.g., a number or string). Accessing `.from` on a number returns undefined, so the check actually works. However, it's cleaner to add an explicit object type check.

**Gap 3: Race conditions in rapid create/delete**
- The 100ms debounce timer handles rapid file changes well.
- When a team is deleted and recreated quickly: the watcher may have the old team in its `teams` map with the old tenant/channel IDs. When the new team appears, `processTeam` checks `if (this.teams.has(teamName))` and skips setup, just re-processing inboxes with stale state.
- **Fix:** `removeTeam` on directory disappearance ensures a clean slate for recreation.

## Validation Architecture

### Test Infrastructure
- Framework: vitest (already configured)
- Config: packages/server/vitest.config.ts
- Quick command: `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts`
- Full command: `cd packages/server && npx vitest run`
- Existing test count: ~208 tests across server + client

### Test Strategy
New tests added to existing `TeamInboxWatcher.test.ts`:
1. "restores archived tenant when team reappears" — archive tenant, start watcher, verify tenant restored
2. "restores archived channels when team reappears" — archive tenant (cascades channels), start watcher, verify channels restored
3. "handles team directory disappearing during operation" — delete team dir after start, verify no crash
4. "handles rapid team creation and deletion" — create/delete/recreate team, verify correct state
5. "handles non-object entries in inbox array" — write inbox with mixed types, verify only valid messages ingested

New tests for TenantService:
6. "upsertByCodebasePath restores archived tenant" — unit test in existing tenant tests

### Files Modified
- `packages/server/src/services/TenantService.ts` — add auto-restore in upsert
- `packages/server/src/watcher/TeamInboxWatcher.ts` — add removeTeam, directory-gone detection
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — add edge case tests
- `packages/server/src/http/__tests__/tenants.test.ts` — add upsert-restores-archived test

## Risk Assessment

**Low risk:** All changes are backward-compatible. The upsert auto-restore is transparent to callers. The watcher improvements are purely defensive. No schema changes, no API changes, no UI changes.
