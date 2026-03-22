# Phase 21: Auto-restore archived channels on new activity - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-restore archived channels and tenants when new activity arrives — new session, team reappearance, or incoming message. The 409 CHANNEL_ARCHIVED rejection becomes auto-restore + accept. This makes the auto-archive from Phase 20 safe: things clean up aggressively but come back when needed. The user_archived flag is no longer a barrier to auto-restore when real activity arrives.

</domain>

<decisions>
## Implementation Decisions

### Auto-restore on message POST (HTTP API)
- Replace the 409 CHANNEL_ARCHIVED rejection in messages.ts and documents.ts routes with auto-restore logic
- When a POST arrives for an archived channel, restore the channel (and its tenant if archived), then process the message normally
- This applies regardless of whether the archive was user-initiated or system-initiated — real activity always wins
- Return 201 as normal, not a special status code — the caller should not need to know restoration happened

### Auto-restore on SessionStart hook
- handleSessionStart should check for an existing archived session channel with the same session_id name before creating a new one
- If found, restore it instead of creating a duplicate channel
- Pattern: use ChannelService.findByName(tenantId, channelName) to check, same pattern as TeamInboxWatcher.processTeam

### Auto-restore on team reappearance (override user_archived)
- TeamInboxWatcher.processTeam currently skips restore when channel.userArchived is true — change this to always restore
- TenantService.upsertByCodebasePath currently skips restore when tenant.userArchived is true — change this to always restore
- Rationale: if the user archived a team channel but the team reappears with new activity, the archive should yield to real activity. The user can always re-archive.

### Tenant cascade on channel restore
- When restoring a channel, check if its parent tenant is archived — if so, restore the tenant too
- A channel cannot be active in an archived tenant (it would be invisible in the sidebar)
- This applies to all three restore triggers (message POST, SessionStart, team reappearance)

### Logging
- Log auto-restore events with a structured JSON log line: { event: 'auto_restore_channel', channelId, tenantId, trigger: 'message' | 'session_start' | 'team_reappearance' }
- Also log tenant auto-restores: { event: 'auto_restore_tenant', tenantId, trigger }

### Claude's Discretion
- Whether to emit a WebSocket event for auto-restore (so the UI updates the sidebar in real-time)
- Exact placement of the restore logic (inline in routes vs. extracted helper)
- Whether to add a system message noting the channel was auto-restored

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChannelService.restore(tenantId, channelId)`: Already exists, clears archivedAt and userArchived
- `ChannelService.findByName(tenantId, name)`: Already exists, finds channels including archived ones
- `TenantService.restore(id)`: Already exists, restores tenant and cascades to channels
- `TenantService.upsertByCodebasePath(name, path)`: Already does partial auto-restore but respects userArchived — needs modification

### Established Patterns
- TeamInboxWatcher.processTeam: findByName → check archivedAt → restore if needed → pattern to replicate for sessions
- Structured JSON logging: all services use console.log(JSON.stringify({ event: ... }))
- Write queue serialization: all DB writes go through queue.enqueue()

### Integration Points
- `packages/server/src/http/routes/messages.ts` line 63-65: 409 CHANNEL_ARCHIVED guard → change to auto-restore
- `packages/server/src/http/routes/documents.ts` line 69-71: Same 409 guard → change to auto-restore
- `packages/server/src/hooks/handlers.ts` handleSessionStart: Always creates new channel → add findByName check
- `packages/server/src/watcher/TeamInboxWatcher.ts` processTeam line 174: userArchived check → remove
- `packages/server/src/services/TenantService.ts` upsertByCodebasePath line 15: userArchived check → remove

</code_context>

<specifics>
## Specific Ideas

- User explicitly said: "auto-restore should override even user-archived state when new activity arrives"
- User wants aggressive cleanups to be safe: "We can do auto cleanups without any worry of things showing back up"
- The system should be "robust" — archive/restore is a self-healing cycle
- The 409 CHANNEL_ARCHIVED behavior was explicitly called out as needing to change: "Instead of rejecting writes to archived channels, the system should auto-restore the channel and accept the message"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-auto-restore-archived-channels-on-new-activity*
*Context gathered: 2026-03-22*
