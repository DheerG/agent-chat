# Phase 3: MCP Server and Hook Ingestion — Research

**Phase:** 03 — MCP Server and Hook Ingestion
**Researched:** 2026-03-07
**Requirements:** AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06

---

## Summary

Phase 3 delivers two integration paths for Claude Code agents into AgentChat:

1. **MCP Server** — A stdio MCP server (`packages/mcp`) that Claude Code launches as a subprocess. Agents actively send/read messages via `send_message`, `read_channel`, and `list_channels` tools. The MCP server connects directly to the SQLite database using the existing service layer.

2. **Hook HTTP Receiver** — A set of HTTP endpoints (`/api/hooks/:eventType`) mounted on the existing Hono server. Claude Code posts lifecycle events (SessionStart, PreToolUse, PostToolUse, etc.) which are ingested as structured event messages.

Both paths share the same data layer (Phase 1) and service layer (Phase 2). No new database tables are needed — the existing `messages`, `channels`, and `presence` tables accommodate all Phase 3 data.

---

## Existing Codebase Inventory

### Phase 1 + Phase 2 Assets (Ready to Consume)

| Asset | Path | Used By |
|-------|------|---------|
| `createDb(path)` / `DbInstance` | `packages/server/src/db/index.ts` | MCP server (direct DB access) |
| `WriteQueue` | `packages/server/src/db/queue.ts` | MCP server (shared write serialization) |
| `createServices(instance, queue)` | `packages/server/src/services/index.ts` | MCP server + hook routes |
| `TenantService.upsertByCodebasePath()` | `packages/server/src/services/TenantService.ts` | Hook receiver (auto-create tenant) |
| `ChannelService.create()` | `packages/server/src/services/ChannelService.ts` | SessionStart hook (auto-create channel) |
| `MessageService.send()` | `packages/server/src/services/MessageService.ts` | MCP send_message + hook event storage |
| `MessageService.list()` | `packages/server/src/services/MessageService.ts` | MCP read_channel |
| `ChannelService.listByTenant()` | `packages/server/src/services/ChannelService.ts` | MCP list_channels |
| `createApp(services)` | `packages/server/src/http/app.ts` | Mount hook routes |
| Shared types: `Message`, `Channel`, `Tenant`, `Presence` | `packages/shared/src/types.ts` | MCP tool responses |
| Drizzle schema: `presence` table | `packages/shared/src/schema.ts` | Agent presence tracking |
| Zod (already installed) | `packages/server/package.json` | Hook payload validation |
| Vitest + in-memory SQLite | `packages/server/vitest.config.ts` | MCP + hook tests |

### What Needs to Be Created

| Component | Location | Notes |
|-----------|----------|-------|
| `packages/mcp/` | New package | MCP server package |
| `packages/server/src/db/queries/presence.ts` | New file | Presence query layer |
| `packages/server/src/services/PresenceService.ts` | New file | Presence upsert/query |
| `packages/server/src/http/routes/hooks.ts` | New file | Hook HTTP receiver |
| MCP tool handlers | `packages/mcp/src/tools/` | send_message, read_channel, list_channels |
| Hook event handlers | `packages/server/src/hooks/` | SessionStart, PreToolUse, PostToolUse, etc. |

---

## MCP Server Architecture

### Package Structure

```
packages/mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point: create MCP server, connect stdio
│   ├── config.ts             # Environment variable parsing
│   ├── tools/
│   │   ├── send-message.ts   # send_message tool handler
│   │   ├── read-channel.ts   # read_channel tool handler
│   │   └── list-channels.ts  # list_channels tool handler
│   └── __tests__/
│       ├── send-message.test.ts
│       ├── read-channel.test.ts
│       └── list-channels.test.ts
```

### MCP SDK Usage (TypeScript)

Based on the official `@modelcontextprotocol/sdk` documentation:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "agent-chat",
  version: "1.0.0",
});

// Register tools using server.tool() with Zod schemas for input validation
server.tool(
  "send_message",
  "Send a message to a channel",
  {
    channel_id: z.string().describe("Channel ID to send message to"),
    content: z.string().describe("Message content"),
    parent_message_id: z.string().optional().describe("Thread parent message ID"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Optional metadata"),
  },
  async ({ channel_id, content, parent_message_id, metadata }) => {
    // Handler implementation
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Critical constraint:** Never use `console.log()` in stdio MCP servers — it corrupts JSON-RPC messages. Use `console.error()` for logging (writes to stderr).

### MCP Server Configuration

The MCP server is configured in Claude Code's settings via the `mcpServers` key:

```json
{
  "mcpServers": {
    "agent-chat": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js"],
      "env": {
        "AGENT_CHAT_DB_PATH": "./data/agent-chat.db",
        "AGENT_CHAT_TENANT_ID": "auto",
        "AGENT_CHAT_AGENT_NAME": "claude-agent"
      }
    }
  }
}
```

### Tool Specifications

#### send_message (AGNT-01)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel_id` | string | yes | Target channel ULID |
| `content` | string | yes | Message text |
| `parent_message_id` | string | no | Thread parent (enables threaded replies) |
| `metadata` | object | no | Arbitrary JSON metadata |

- `sender_id` and `sender_name` come from server config (env vars), NOT per-call
- Returns: `{ id, channelId, content, createdAt }` as JSON text content

#### read_channel (AGNT-02)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel_id` | string | yes | Channel to read from |
| `limit` | number | no | Max messages (default 50) |
| `after` | string | no | ULID cursor for pagination |

- **Self-exclusion filter:** Results exclude messages where `senderId === configured agent_id`
- This is implemented at the MCP tool level, not the service level
- Returns: `{ messages: [...], hasMore: boolean }` as JSON text content

#### list_channels (AGNT-06)

No parameters — tenant_id is implicit from server config.

- Returns: `{ channels: [...] }` as JSON text content

### Data Flow: MCP Tool Call

```
Claude Code Agent
    │
    ├── stdio ──► packages/mcp/src/index.ts (MCP Server)
    │                │
    │                ├── Parse tool call via @modelcontextprotocol/sdk
    │                ├── Look up services from createServices(db, queue)
    │                ├── Call service method (e.g., services.messages.send())
    │                └── Return JSON result as text content
    │
    └── (SQLite DB shared with HTTP server via WAL mode)
```

---

## Hook HTTP Receiver Architecture

### Claude Code Hook Event Format

Hooks receive JSON via stdin. Key fields by event type:

| Event | Stdin JSON Fields | Blocking? |
|-------|------------------|-----------|
| **SessionStart** | `session_id`, `cwd`, `hook_event_name` | No |
| **PreToolUse** | `session_id`, `cwd`, `tool_name`, `tool_input` | Yes (exit 2 blocks) |
| **PostToolUse** | `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_output` | No |
| **Notification** | `session_id`, `cwd`, notification details | No |
| **SessionEnd** | `session_id`, `cwd` | No |

### Hook Configuration in Claude Code

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/SessionStart -H 'Content-Type: application/json' -d \"$(cat)\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/PreToolUse -H 'Content-Type: application/json' -d \"$(cat)\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/PostToolUse -H 'Content-Type: application/json' -d \"$(cat)\""
          }
        ]
      }
    ]
  }
}
```

The hook scripts receive JSON via stdin from Claude Code, and forward it via curl to the AgentChat HTTP server.

### Hook Event Handling Strategy

| Event Type | Action | senderType | messageType | Details |
|------------|--------|-----------|-------------|---------|
| **SessionStart** | Create session channel + update presence | system | text | Channel name: `session-{session_id}`, type: 'session'. Presence: status 'active' |
| **SessionEnd** | Update presence + system message | system | text | Presence: status 'idle'. System message noting session end |
| **PreToolUse** | Store as event message | hook | event | metadata: `{ tool_name, tool_input, phase: 'pre' }` |
| **PostToolUse** | Store as event message | hook | event | metadata: `{ tool_name, tool_input, tool_output_summary, phase: 'post' }` |
| **Notification** | Store as hook message | hook | hook | metadata: notification content |
| **All others** | Discard (return 200 OK) | — | — | Silently acknowledge, do not store |

### Hook Route Design

```typescript
// packages/server/src/http/routes/hooks.ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

const HookPayloadSchema = z.object({
  session_id: z.string(),
  cwd: z.string(),
  hook_event_name: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.unknown()).optional(),
  tool_output: z.unknown().optional(),
});

export function hookRoutes(services: Services): Hono {
  const router = new Hono();

  // POST /api/hooks/:eventType
  router.post('/:eventType', async (c) => {
    const eventType = c.req.param('eventType');
    // ... validate, dispatch to handler
    return c.json({ received: true });
  });

  return router;
}
```

### Data Flow: Hook Event

```
Claude Code
    │
    ├── Hook triggers ──► Shell script (curl)
    │                        │
    │                        └── HTTP POST ──► /api/hooks/:eventType
    │                                           │
    │                                           ├── Validate payload (Zod)
    │                                           ├── Dispatch by eventType
    │                                           ├── SessionStart → create channel + upsert presence
    │                                           ├── PreToolUse → insert event message
    │                                           ├── PostToolUse → insert event message
    │                                           └── Return { received: true }
    │
    └── (Same SQLite DB)
```

---

## Presence Query Layer

Currently missing from Phase 1. The `presence` table exists in the Drizzle schema but has no query functions.

### Queries Needed

```typescript
// packages/server/src/db/queries/presence.ts
export function createPresenceQueries(instance: DbInstance, queue: WriteQueue) {
  return {
    // Upsert: INSERT OR REPLACE based on (agentId, channelId)
    async upsertPresence(tenantId: string, data: {
      agentId: string;
      channelId: string;
      status: 'active' | 'idle';
    }): Promise<Presence> { ... },

    // Get all presence records for a channel
    getPresenceByChannel(tenantId: string, channelId: string): Presence[] { ... },

    // Get presence for a specific agent
    getPresenceByAgent(tenantId: string, agentId: string): Presence | null { ... },
  };
}
```

### PresenceService

```typescript
// packages/server/src/services/PresenceService.ts
export class PresenceService {
  async upsert(tenantId: string, data: {
    agentId: string;
    channelId: string;
    status: 'active' | 'idle';
  }): Promise<Presence> { ... }

  getByChannel(tenantId: string, channelId: string): Presence[] { ... }
}
```

Update `createServices` to include `presence: PresenceService`.

---

## Agent Identity Strategy

### Cross-Path Consistency (STATE.md blocker resolution)

The blocker from STATE.md states: "Agent identity must be consistent across MCP tool calls and hook events."

**Solution:** Use the Claude Code session ID as the canonical `agent_id`:

- **MCP path:** Agent ID configured via `AGENT_CHAT_AGENT_ID` env var. When "auto" is specified, the MCP server generates a stable ID from the process context.
- **Hook path:** `session_id` field from the hook payload is the agent identifier.
- **Consistency:** The Claude Code session that launched the MCP server is the same session that emits hook events. Both paths use the same session_id.

**Practical approach:** The MCP server's `AGENT_CHAT_AGENT_ID` should be set to the Claude Code session ID. The hook configuration can pass session_id in the curl payload. Both paths then use identical agent_id values.

---

## File Structure to Create

```
packages/mcp/                              # NEW PACKAGE
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                           # MCP server entry point
│   ├── config.ts                          # Environment config parsing
│   ├── tools/
│   │   ├── send-message.ts
│   │   ├── read-channel.ts
│   │   └── list-channels.ts
│   └── __tests__/
│       ├── send-message.test.ts
│       ├── read-channel.test.ts
│       └── list-channels.test.ts

packages/server/src/
├── db/queries/
│   └── presence.ts                        # NEW — presence query layer
├── services/
│   ├── PresenceService.ts                 # NEW — presence service
│   └── index.ts                           # MODIFIED — add presence to Services
├── http/
│   ├── app.ts                             # MODIFIED — mount hook routes
│   └── routes/
│       └── hooks.ts                       # NEW — hook HTTP receiver
└── hooks/                                 # NEW — hook event handlers
    ├── index.ts                           # Handler registry/dispatcher
    ├── session-start.ts                   # SessionStart handler
    ├── session-end.ts                     # SessionEnd handler
    ├── tool-use.ts                        # PreToolUse/PostToolUse handler
    └── __tests__/
        ├── hooks.test.ts                  # Hook route integration tests
        └── session-start.test.ts
```

---

## Dependencies to Add

### packages/mcp/package.json

```json
{
  "name": "@agent-chat/mcp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "agent-chat-mcp": "./dist/index.js"
  },
  "dependencies": {
    "@agent-chat/server": "workspace:*",
    "@agent-chat/shared": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Note: The MCP SDK requires `zod@3` (Zod 3.x). Our project uses `zod@^4.3.6` (Zod 4.x). The MCP SDK's `server.tool()` method uses Zod for input schema validation. We need to verify compatibility or install zod@3 alongside zod@4 for the MCP package. If incompatible, we may need to use the lower-level `server.registerTool()` API with raw JSON Schema instead of Zod schemas.

**Zod compatibility check needed:** The MCP SDK examples show `npm install @modelcontextprotocol/sdk zod@3`. If the SDK internally depends on zod@3 and our project uses zod@4, this creates a conflict. Resolution options:
1. Use zod@3 in packages/mcp only (workspace package isolation)
2. Use the raw JSON Schema API in the MCP SDK (avoid Zod entirely in MCP package)
3. Check if `@modelcontextprotocol/sdk` has updated to support zod@4

---

## Testing Strategy

### MCP Server Tests

MCP tools are thin wrappers over the service layer. Tests verify:
1. Tool registration (tools appear in server capabilities)
2. Tool execution (correct service method called, correct response shape)
3. Self-exclusion filter on read_channel (AGNT-02)
4. Error handling (invalid channel_id, etc.)

Test pattern: Create in-memory DB, createServices, call tool handlers directly (bypass MCP transport layer for unit tests). Integration tests can use the MCP SDK's client to connect via pipes.

### Hook Receiver Tests

Integration tests using Hono's `app.fetch` directly:
1. POST /api/hooks/SessionStart creates channel and presence
2. POST /api/hooks/PreToolUse inserts event message with correct metadata
3. POST /api/hooks/PostToolUse inserts event message with tool output
4. POST /api/hooks/Unknown returns 200 but doesn't create messages
5. Invalid payload returns 422

### Test Infrastructure

Same as Phase 1/2: Vitest + in-memory SQLite (`:memory:`). MCP tests can import from `@agent-chat/server` directly.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Zod version conflict between MCP SDK (zod@3) and project (zod@4) | High | Use raw JSON Schema in MCP SDK tool registration, or isolate zod@3 in mcp package |
| MCP stdio transport corrupted by console.log | Medium | Use console.error only; lint rule or code review |
| Hook events arrive before HTTP server is ready | Low | Hooks are configured to post to localhost:3000; if server not up, curl fails silently |
| Concurrent DB access from MCP + HTTP server processes | Low | WAL mode supports concurrent readers; write queue serializes writes |
| Hook payload schema changes between Claude Code versions | Medium | Zod validation with `.passthrough()` — accept unknown fields |
| Large tool_output in PostToolUse events | Medium | Truncate tool_output to reasonable size (e.g., first 1000 chars) in metadata |

---

## Implementation Order (Recommended Plans)

### Plan 1 (Wave 1): Presence layer + Hook receiver infrastructure
- Create presence queries and PresenceService
- Extend Services interface to include presence
- Create hook routes with event dispatcher
- Implement SessionStart, PreToolUse, PostToolUse handlers
- Mount hook routes on existing Hono app
- Integration tests for hooks

### Plan 2 (Wave 1, parallel): MCP server package + tools
- Scaffold packages/mcp with package.json, tsconfig
- Create MCP server with stdio transport
- Implement send_message, read_channel, list_channels tools
- Self-exclusion filter for read_channel
- Unit tests for each tool

### Plan 3 (Wave 2): Integration tests + agent identity consistency
- End-to-end integration tests proving MCP + hooks share the same data
- Verify cross-path agent identity consistency
- Verify SessionStart auto-creates channels
- Verify tool events are queryable via read_channel

---

## Validation Architecture

### What Gets Validated Where

| Layer | Validation | Mechanism |
|-------|-----------|-----------|
| MCP tool input | Parameter types, required fields | Zod schemas via MCP SDK |
| Hook payload | Required fields, event type | Zod schemas in hook routes |
| Service layer | Tenant/channel existence | 404 errors |
| Query layer | None — assumes valid inputs | — |

### Success Criteria Verification Map

| Success Criterion | Test(s) | Requirement |
|-------------------|---------|-------------|
| Agent can call send_message via MCP and see it in channel | MCP send_message test | AGNT-01 |
| read_channel excludes agent's own messages | MCP read_channel self-exclusion test | AGNT-02 |
| list_channels returns channels for tenant | MCP list_channels test | AGNT-06 |
| SessionStart hook creates channel | Hook integration test | AGNT-04 |
| PreToolUse/PostToolUse stored as events | Hook integration test | AGNT-03, AGNT-05 |
| MCP server runs via stdio | MCP entry point test | AGNT-05 |

---

## RESEARCH COMPLETE

Phase 3 research complete. MCP SDK TypeScript API documented. Claude Code hook event format mapped. Presence query layer designed. Hook handler strategy defined for all relevant event types. Agent identity cross-path consistency resolved via session_id. Zod version conflict identified as primary risk.
