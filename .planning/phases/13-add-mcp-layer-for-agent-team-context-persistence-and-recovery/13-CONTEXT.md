# Phase 13: MCP Layer for Agent Team Context Persistence and Recovery - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add new MCP tools that enable agent team members to persist context, recover after session compaction/reset, retrieve full message history or summaries, query per-agent activity, and track check-in timestamps. These tools extend the existing `packages/mcp` server and may add new query methods to `packages/server` services.

This phase does NOT add new UI features, does NOT modify the TeamInboxWatcher, and does NOT change the existing MCP tools (send_message, read_channel, list_channels, document tools).

</domain>

<decisions>
## Implementation Decisions

### MCP Tool Design — New Tools
- **`get_team_context`** — Returns a summary of recent team activity for the calling agent's tenant
  - Parameters: `since` (optional ISO timestamp or "last_checkin"), `channel_id` (optional — scope to one channel), `include_full_messages` (optional boolean, default false — if true returns full messages, if false returns a compact summary)
  - When `since` is "last_checkin", uses the stored last check-in timestamp for this agent
  - Returns: `{ summary: string, message_count: number, channels_active: string[], last_checkin: string | null }`
  - When `include_full_messages` is true, returns `{ messages: Message[], message_count: number, channels_active: string[], last_checkin: string | null }`
  - Limits to 200 messages max per call to avoid context window bloat

- **`get_agent_activity`** — Returns messages sent by or mentioning a specific agent
  - Parameters: `agent_name` (optional — defaults to calling agent), `since` (optional ISO timestamp or "last_checkin"), `channel_id` (optional)
  - Returns: `{ messages: Message[], message_count: number }`
  - Filters by senderId or senderName matching the agent name
  - Limits to 100 messages max per call

- **`checkin`** — Records a check-in timestamp for the calling agent
  - Parameters: none
  - Stores current ISO timestamp as the agent's last check-in time
  - Returns: `{ checked_in_at: string, previous_checkin: string | null }`
  - Agents call this after consuming context to set the "since last_checkin" watermark

- **`get_team_members`** — Returns team member info from the TeamInboxWatcher's cached config
  - Parameters: none (uses tenant context)
  - Returns: `{ members: Array<{ name, agentId, agentType, status }>, team_name: string }`
  - Pulls from the team config.json that TeamInboxWatcher already reads, or falls back to presence table

### Check-in Persistence
- New `checkins` table in SQLite: `agent_id TEXT, tenant_id TEXT, last_checkin_at TEXT, PRIMARY KEY (agent_id, tenant_id)`
- Check-in timestamps survive service restarts (persisted in DB, not in-memory)
- Idempotent migration via `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` pattern (same as existing migrations)
- New `CheckinQueries` module in `packages/server/src/db/queries/checkins.ts`
- New `CheckinService` in `packages/server/src/services/CheckinService.ts` — thin wrapper over queries

### Summary Generation
- Summaries are generated server-side as structured text, not by an LLM
- Summary format: group messages by channel, show message count per channel, list active senders, show most recent message per channel
- Example summary: `"Channel #team-alpha: 12 messages since last check-in. Active: researcher, planner, tester. Latest: 'Completed task 5 — tests passing.'"`
- This is deterministic and fast — no external API calls required

### Message Query Extensions
- New query method `getMessagesSince(tenantId, channelId, since: string)` — returns all messages with createdAt > since
- New query method `getMessagesBySender(tenantId, channelId, senderId: string, opts)` — filters by senderId
- New query method `getMessagesByTenant(tenantId, since: string, limit: number)` — cross-channel query for tenant-wide context
- These live in existing `messages.ts` queries module — no new query file needed

### Integration with Existing MCP Server
- New tools registered in `packages/mcp/src/index.ts` alongside existing tools
- New tool handlers in `packages/mcp/src/tools/` — one file per tool: `get-team-context.ts`, `get-agent-activity.ts`, `checkin.ts`, `get-team-members.ts`
- CheckinService added to `Services` interface and `createServices()` factory
- Config already has `agentId` and `tenantId` — no config changes needed

### Claude's Discretion
- Exact summary text formatting and structure
- Whether to include message metadata in summary vs just content
- Error message wording for edge cases (no messages found, invalid agent name)
- Test fixture design for new tools
- Whether getMessagesByTenant needs its own index or existing indexes suffice

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `McpConfig` (`packages/mcp/src/config.ts`): Already has agentId, agentName, tenantId, dbPath — sufficient for all new tools
- `MessageService.list()` (`packages/server/src/services/MessageService.ts`): Cursor-based pagination already works, can be extended for time-based queries
- `createMessageQueries()` (`packages/server/src/db/queries/messages.ts`): Add new query methods here alongside existing getMessages/getMessageById
- `TeamInboxWatcher.teams` map (`packages/server/src/watcher/TeamInboxWatcher.ts`): Has cached TeamConfig with member info — could expose via a public method
- `Services` interface (`packages/server/src/services/index.ts`): Add CheckinService here
- `WriteQueue` (`packages/server/src/db/queue.ts`): Use for checkin upserts (same write serialization pattern)

### Established Patterns
- Tool handler pattern: `handleX(services, config, tenantId, params)` returning a plain object — follow for all new tools
- MCP tool registration: `server.tool(name, description, zodSchema, handler)` — follow exact pattern from index.ts
- Query module pattern: `createXQueries(instance, queue)` returning an object of methods — follow for checkin queries
- Service pattern: class with constructor taking queries, thin methods calling queries — follow for CheckinService
- DB migration pattern: `try { rawDb.exec('ALTER TABLE...'); } catch { /* already exists */ }` — use for checkins table
- All IDs are ULIDs, all timestamps are ISO 8601 strings
- `tenantId` is always the first argument to query/service methods

### Integration Points
- `packages/server/src/db/index.ts`: Add `CREATE TABLE IF NOT EXISTS checkins` to DDL
- `packages/server/src/db/queries/`: Add `checkins.ts`
- `packages/server/src/services/index.ts`: Add CheckinService to Services interface and createServices factory
- `packages/server/src/lib.ts`: Export CheckinService
- `packages/mcp/src/index.ts`: Register 4 new tools
- `packages/mcp/src/tools/`: Add 4 new handler files

</code_context>

<specifics>
## Specific Ideas

- The "last_checkin" magic string in the `since` parameter is the key UX win — agents can simply ask "what happened since I last checked?" without tracking timestamps themselves
- `get_team_context` with `include_full_messages: false` is the default path — keeps context window usage minimal. Full messages available when agent needs to dive deep
- Check-in is a separate explicit action (not implicit on read) — this lets agents read context without advancing their watermark, useful for "peek without committing"
- Team members endpoint gives agents self-awareness about who's on the team without reading filesystem directly

</specifics>

<deferred>
## Deferred Ideas

- LLM-generated summaries of team activity (would require API key configuration, adds complexity)
- Cross-tenant context queries (agents working across multiple projects)
- Message search via FTS5 — already tracked as v2 requirement AGNT-09
- Agent @mentions with context injection — v2 requirement AGNT-07
- WebSocket push for new team context events (agent could subscribe to team updates)

</deferred>

---

*Phase: 13-add-mcp-layer-for-agent-team-context-persistence-and-recovery*
*Context gathered: 2026-03-08*
