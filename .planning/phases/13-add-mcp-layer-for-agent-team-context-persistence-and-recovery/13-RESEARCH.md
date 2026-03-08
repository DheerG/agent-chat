# Phase 13: MCP Layer for Agent Team Context Persistence and Recovery — Research

**Completed:** 2026-03-08
**Researcher:** Direct (inline)

## Codebase Analysis

### Existing Architecture

The MCP server (`packages/mcp`) is a standalone stdio process that connects directly to the SQLite database:

1. **Config** (`packages/mcp/src/config.ts`): `McpConfig` with `dbPath`, `tenantId` (auto or ULID), `agentId`, `agentName`
2. **Tools** (`packages/mcp/src/tools/`): One handler file per tool — `send-message.ts`, `read-channel.ts`, `list-channels.ts`, plus document tools
3. **Entry point** (`packages/mcp/src/index.ts`): Registers all tools on `McpServer`, connects via `StdioServerTransport`
4. **Data access**: Imports `createDb`, `WriteQueue`, `createServices` from `@agent-chat/server` — shares SQLite DB via WAL mode

### Tool Handler Pattern

Every tool handler follows this pattern:
```typescript
// File: packages/mcp/src/tools/{tool-name}.ts
import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';

export interface {ToolName}Args { /* snake_case params */ }
export interface {ToolName}Result { /* return shape */ }

export function handle{ToolName}(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: {ToolName}Args
): {ToolName}Result { /* ... */ }
```

The `index.ts` registers each tool with:
```typescript
server.tool(
  'tool_name',
  'Description string',
  { /* zod schema */ },
  async ({ param1, param2 }) => {
    try {
      const result = await handleToolName(services, config, tenantId, { param1, param2 });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);
```

### Query Layer Pattern

Queries follow `createXQueries(instance, queue)` returning an object of methods:
- `instance: DbInstance` has `db` (Drizzle) and `rawDb` (better-sqlite3)
- `queue: WriteQueue` for serialized writes
- Read operations are synchronous (better-sqlite3 is sync)
- Write operations use `await queue.enqueue(() => ...)`
- All query methods take `tenantId` as first argument

### Service Layer Pattern

Services are thin classes wrapping queries:
```typescript
export class XService {
  constructor(private q: XQueries) {}
  methodName(tenantId: string, ...args): ReturnType { return this.q.queryMethod(tenantId, ...args); }
}
```

### Database Schema

Messages table has: `id, channel_id, tenant_id, parent_message_id, sender_id, sender_name, sender_type, content, message_type, metadata, created_at`

Key indexes:
- `idx_messages_tenant_channel` on `(tenant_id, channel_id, id)` — primary query path
- `idx_messages_thread` on `(parent_message_id)`

**Missing for Phase 13:**
- No index on `(tenant_id, sender_id)` — needed for `getMessagesBySender`
- No index on `(tenant_id, created_at)` — needed for cross-channel tenant-wide queries
- The existing `idx_messages_tenant_channel` covers `getMessagesSince(tenantId, channelId, since)` since we can filter by created_at after using the index for tenant+channel

### TeamInboxWatcher Integration

`TeamInboxWatcher` caches `TeamConfig` objects in `this.teams: Map<string, TeamState>`. Each `TeamState` has:
- `tenantId`, `channelId`, `config: TeamConfig`
- `TeamConfig` has `name`, `description?`, `createdAt?`, `leadAgentId?`, `members?: Array<{agentId, name, agentType?, model?, color?, cwd?}>`

The `teams` map is private. For `get_team_members` to work, we need either:
1. Query the team config from the filesystem directly (simpler, the MCP process has access)
2. Add a public method to TeamInboxWatcher to expose team data (not accessible from MCP process — different process)
3. Store team member info in the database (new table or metadata)

**Option 3 is best** because the MCP process shares the database but not memory with the HTTP server. However, this adds complexity. **Simpler approach: The MCP server can read `~/.claude/teams/` directly** since it has filesystem access and the TEAMS_DIR env var pattern is already established. This avoids a new DB table for team member data.

### Check-in Table Design

New `checkins` table:
```sql
CREATE TABLE IF NOT EXISTS checkins (
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  last_checkin_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, tenant_id)
);
```

Upsert via `INSERT ... ON CONFLICT DO UPDATE SET last_checkin_at = excluded.last_checkin_at` — same pattern as presence table.

### New Query Methods Needed

**In messages.ts (extend existing):**

1. `getMessagesSince(tenantId, channelId, since: string, limit: number)` — messages with `created_at > since` for a specific channel. Uses existing `idx_messages_tenant_channel` index with additional `created_at` filter.

2. `getMessagesByTenantSince(tenantId, since: string, limit: number)` — cross-channel query. All messages for a tenant since a timestamp. Needs scanning but acceptable at local scale (single dev machine, not millions of messages).

3. `getMessagesBySender(tenantId, senderId: string, opts: { since?: string, channelId?: string, limit?: number })` — filter by senderId. Also needs scan but acceptable at local scale.

**New file checkins.ts:**
- `upsertCheckin(agentId, tenantId)` — sets last_checkin_at to now, returns previous value
- `getCheckin(agentId, tenantId)` — returns last_checkin_at or null

### Summary Generation Strategy

Server-side deterministic summary (no LLM needed):
1. Query messages since timestamp grouped by channel
2. For each channel: count messages, list unique senders, get most recent message
3. Format as structured text

Example output:
```
Team activity since 2026-03-08T10:00:00.000Z:

Channel "team-alpha" (12 messages):
  Active agents: researcher, planner, tester
  Latest: [researcher] "Completed task 5 — tests passing."

Channel "team-beta" (3 messages):
  Active agents: lead
  Latest: [lead] "Starting code review."

Total: 15 messages across 2 channels
```

### Test Strategy

Follow existing patterns from `packages/mcp/src/__tests__/tools.test.ts`:
- In-memory SQLite via `createDb(':memory:')`
- Create test tenant + channel in `beforeEach`
- Test each tool handler function directly (not via MCP protocol)
- Assert return shapes match expected interfaces

New test file: `packages/mcp/src/__tests__/context-tools.test.ts`

Additional test file: `packages/server/src/db/__tests__/checkins.test.ts` for query-level tests

## Validation Architecture

### Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/mcp/vitest.config.ts, packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run && cd ../mcp && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

### Test Coverage Map

| Component | Test Type | What's Verified |
|-----------|-----------|-----------------|
| checkins.ts queries | unit | upsert, get, return values |
| CheckinService | unit | thin wrapper methods |
| getMessagesSince query | unit | timestamp filtering, limit |
| getMessagesByTenantSince query | unit | cross-channel filtering |
| getMessagesBySender query | unit | sender filtering |
| get_team_context handler | unit | summary generation, since/last_checkin |
| get_agent_activity handler | unit | agent filtering, self-query |
| checkin handler | unit | timestamp recording, previous value |
| get_team_members handler | unit | team config reading |
| Full MCP registration | integration | all tools registered without error |
| Existing tools | regression | existing tests still pass |
