# Phase 3: MCP Server and Hook Ingestion - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code agents can actively send and read messages via MCP stdio tools, and lifecycle events are passively captured via a Claude Code hooks HTTP receiver. This phase delivers the `packages/mcp` package (stdio MCP server with `send_message`, `read_channel`, `list_channels` tools) and a hooks HTTP endpoint on the existing Hono server that ingests Claude Code lifecycle events as structured messages.

Requirements: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06

</domain>

<decisions>
## Implementation Decisions

### MCP Tool Design
- Three MCP tools: `send_message`, `read_channel`, `list_channels`
- `send_message` parameters: `channel_id`, `content`, `parent_message_id` (optional for threads), `metadata` (optional JSON object)
  - Agent identity (sender_id, sender_name) comes from MCP server configuration at startup, not per-call — agents should not need to identify themselves on every message
  - Returns the created message object (id, content, createdAt)
- `read_channel` parameters: `channel_id`, `limit` (optional, default 50), `after` (optional ULID cursor)
  - Returns messages in ascending chronological order
  - Excludes messages sent by the calling agent (AGNT-02: agent never sees its own outgoing messages in results) — filtered by sender_id match
  - Returns `{ messages: Message[], hasMore: boolean }`
- `list_channels` parameters: none required (tenant is implicit from server config)
  - Returns `{ channels: Channel[] }` — all channels for the configured tenant
- All tools operate within a single tenant context — tenant_id is configured at MCP server startup, not passed per tool call
- Tool responses are JSON — structured for agent consumption, not human-readable prose

### MCP Server Transport
- MCP v1 stdio transport only (locked decision from STATE.md — v2 is pre-alpha)
- `packages/mcp` as a separate package in the monorepo — standalone entry point that Claude Code launches as a subprocess
- MCP server connects to the same SQLite database as the HTTP server — it imports `createDb`, `WriteQueue`, and `createServices` from `@agent-chat/server`
- Server configuration via environment variables: `AGENT_CHAT_TENANT_ID`, `AGENT_CHAT_AGENT_ID`, `AGENT_CHAT_AGENT_NAME`, `AGENT_CHAT_DB_PATH`
- No HTTP dependency — MCP server talks directly to the data layer (same process, shared DB file via WAL mode which supports concurrent readers)
- Uses the official `@modelcontextprotocol/sdk` package for MCP server implementation

### Hook Event Handling
- Hook events arrive via HTTP POST to `/api/hooks/:eventType` on the existing Hono server
- Claude Code emits these hook event types; handling strategy for each:
  - **SessionStart** -> Create a session channel (type='session') for the agent, update presence to 'active'. This is the auto-channel-creation trigger (AGNT-04)
  - **SessionEnd** -> Update presence to 'idle', post a system message to the session channel noting session end
  - **PreToolUse** -> Store as event message (messageType='event') with tool name and arguments in metadata. Enables observability of what tools agents are calling
  - **PostToolUse** -> Store as event message (messageType='event') with tool name, arguments, and result summary in metadata. Paired with PreToolUse for full tool-call lifecycle
  - **Notification** -> Store as event message (messageType='hook') — captures agent notifications (errors, warnings, status updates)
  - **All other hook types** -> Discard silently (return 200 OK but do not store). Future phases can add handlers as needed
- Hook messages use `senderType: 'hook'` and `messageType: 'event'` or `'hook'` depending on the event category
- Hook endpoint does NOT require authentication (local-only service, consistent with project constraints)
- Hook payload validated via Zod schemas — malformed payloads return 422

### Agent Identity
- Each agent session has a consistent identity across MCP and hook paths
- Identity is composed of: `agent_id` (stable identifier, e.g., derived from session ID or configured), `agent_name` (human-readable label)
- MCP path: agent_id and agent_name set via environment variables at MCP server startup
- Hook path: agent_id derived from the session context in the hook payload (Claude Code includes session metadata)
- The presence table tracks agent_id + channel_id + status — updated by both SessionStart/SessionEnd hooks and MCP tool calls
- Cross-path consistency: the same agent_id must appear in both MCP messages and hook events for the same session. This is achieved by using the Claude Code session ID as the canonical agent_id

### Hook HTTP Receiver Design
- New route group: `/api/hooks` mounted on the existing Hono app
- `POST /api/hooks/:eventType` — single endpoint with event type as URL param
- Request body is the hook event payload (JSON)
- Response: `{ received: true }` with 200 status for all accepted events (including discarded ones)
- Endpoint is synchronous from the caller's perspective — hook events are fire-and-forget from Claude Code's side
- The hook receiver uses the same `Services` instance as the HTTP API routes

### Claude's Discretion
- Exact MCP SDK server setup boilerplate
- Hook payload Zod schema details (field names, nesting)
- How to structure the metadata JSON for tool-call events (which fields to extract from PreToolUse/PostToolUse)
- Presence upsert implementation (INSERT OR REPLACE vs separate check)
- Test fixture design for MCP server integration tests
- Whether to log discarded hook events at debug level

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createServices(db, queue)` from `packages/server/src/services/index.ts` — MCP server can import and use the same service layer
- `MessageService.send()` — already accepts `senderType: 'hook'` and `messageType: 'event' | 'hook'`
- `ChannelService.create()` — already accepts `type: 'session'` and `sessionId` parameter, ready for SessionStart hook
- `TenantService.upsertByCodebasePath()` — can auto-create tenant from hook events
- `createDb(dbPath)` and `WriteQueue` — shareable across MCP and HTTP server processes via WAL mode
- Shared types (`Message`, `Channel`, `Tenant`, `Presence`) from `@agent-chat/shared`
- Drizzle schema already has `presence` table with `agentId`, `status`, `lastSeenAt`
- Zod already a dependency — use for hook payload validation

### Established Patterns
- `tenantId` as first argument to all service/query functions — MCP tools provide this from config, hook receiver extracts from payload
- All IDs are ULIDs — consistent across MCP and hook paths
- Hono route pattern: `function xRoutes(services: Services): Hono` — hook routes follow same pattern
- Services are thin wrappers over queries — no complex business logic, keeps MCP and hook code simple
- Error response shape: `{ error: string, code: string }` — hook endpoint follows same convention
- Vitest + in-memory SQLite for tests — MCP server tests can use same pattern

### Integration Points
- `packages/server/src/http/app.ts` — add `app.route('/api/hooks', hookRoutes(services))` for hook receiver
- `packages/server/src/index.ts` — no changes needed; hook routes mount on existing Hono app
- `packages/mcp/src/index.ts` — new entry point; imports from `@agent-chat/server` and `@agent-chat/shared`
- Claude Code MCP config (`.claude/settings.json` or equivalent) — configures `packages/mcp` as stdio MCP server
- Presence queries needed — `packages/server/src/db/queries/` needs a presence query module (upsert, getByChannel)

</code_context>

<specifics>
## Specific Ideas

- MCP server is a thin stdio wrapper — all business logic lives in the existing service layer, MCP just translates tool calls to service method invocations
- Hook receiver is equally thin — validates payload, maps event type to handler, calls service methods
- The `read_channel` self-exclusion filter (AGNT-02) is implemented at the MCP tool level, not the service level — `MessageService.list()` returns all messages, MCP tool filters out `senderId === configuredAgentId` before returning
- SessionStart hook creates channels with a predictable name format: `session-{sessionId}` or similar agent-readable name
- Tool-call events (PreToolUse/PostToolUse) store tool name as top-level field in metadata for easy querying later

</specifics>

<deferred>
## Deferred Ideas

- MCP tool for searching messages (FTS5) — v2 feature (AGNT-09)
- MCP tool for message reactions/acknowledgments — v2 feature (AGNT-08)
- MCP tool for @mentioning other agents — v2 feature (AGNT-07)
- MCP tool for document/canvas operations — Phase 6 (DOC-01, DOC-02)
- WebSocket broadcast on new message — Phase 4 concern
- Presence heartbeat mechanism (periodic liveness check) — Phase 5 UI concern
- Hook event replay/backfill for missed events — future enhancement

</deferred>

---

*Phase: 03-mcp-server-and-hook-ingestion*
*Context gathered: 2026-03-07*
