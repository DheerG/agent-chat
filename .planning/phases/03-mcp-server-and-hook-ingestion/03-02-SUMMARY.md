---
phase: 03-mcp-server-and-hook-ingestion
plan: 02
status: complete
---

# Plan 03-02 Summary: MCP Server Package

## What was built

1. **Package scaffold** (`packages/mcp/`)
   - package.json with @modelcontextprotocol/sdk ^1.27.1 dependency
   - tsconfig.json with project references to shared and server
   - vitest.config.ts for test infrastructure

2. **Server library entry point** (`packages/server/src/lib.ts`)
   - Side-effect-free re-exports: createDb, WriteQueue, createServices, etc.
   - Server package.json exports map: `.` -> lib.js, `./server` -> index.js
   - Allows MCP package to import without triggering HTTP server startup

3. **MCP config** (`packages/mcp/src/config.ts`)
   - Environment variable based: AGENT_CHAT_DB_PATH, AGENT_CHAT_TENANT_ID, AGENT_CHAT_AGENT_ID, AGENT_CHAT_AGENT_NAME
   - Sensible defaults for all fields

4. **MCP tools** (3 tools):
   - `send_message` (`packages/mcp/src/tools/send-message.ts`): Creates messages with agent identity from config
   - `read_channel` (`packages/mcp/src/tools/read-channel.ts`): Returns messages with AGNT-02 self-exclusion filter
   - `list_channels` (`packages/mcp/src/tools/list-channels.ts`): Returns all channels for configured tenant

5. **MCP server entry point** (`packages/mcp/src/index.ts`)
   - McpServer with StdioServerTransport
   - Registers 3 tools with zod v4 schemas (MCP SDK v1.27.1 has zod v3+v4 compat layer)
   - Auto-creates tenant from working directory when tenantId is 'auto'
   - Shares SQLite DB with HTTP server via WAL mode

6. **Tool unit tests** (`packages/mcp/src/__tests__/tools.test.ts`)
   - 11 tests covering sender identity, self-exclusion, threading, pagination, metadata

## Requirements covered

- AGNT-01: send_message via MCP
- AGNT-02: read_channel with self-exclusion
- AGNT-05: MCP server as stdio subprocess
- AGNT-06: list_channels via MCP

## Test results

- 11 tool tests + 4 integration tests = 15 MCP tests passed
- No regressions in server or shared packages
