# Phase 8: Add to Existing Codebases - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a setup process that lets users add AgentChat to any existing local codebase so Claude Code agents in that project can communicate through AgentChat. This includes a setup script/CLI, configuration generation for Claude Code hooks and MCP, and usage documentation. The setup must wire a target codebase to the running AgentChat server without requiring changes to the user's project code.

</domain>

<decisions>
## Implementation Decisions

### Setup mechanism
- Single shell script (`scripts/setup.sh`) that users run from their target project directory
- Also provide an `npx`-style invocation by adding a `bin` entry to the root package.json: `npx agent-chat-setup` (or users can run the script directly)
- Script is idempotent — safe to run multiple times
- No npm package publishing required; the script works from a local clone of AgentChat

### What the setup script does
- Validates that the AgentChat server build exists (prompts user to build if not)
- Detects the target project's cwd and derives a tenant name from the directory basename
- Creates/merges `.claude/settings.json` in the target project with:
  - Hook entries (SessionStart, PreToolUse, PostToolUse, SessionEnd) pointing to AgentChat's HTTP hooks endpoint
  - MCP server configuration pointing to the built `@agent-chat/mcp` binary
- Sets proper environment variables in the MCP config (AGENT_CHAT_DB_PATH, AGENT_CHAT_CWD)
- Does NOT overwrite existing `.claude/settings.json` — merges hooks and mcpServers entries, preserving user's existing config

### Hook configuration format
- Hooks use `curl` commands to POST to `http://localhost:5555/api/hooks/:eventType`
- Each hook sends session_id, cwd, and event-specific fields as JSON
- Claude Code provides hook context via environment variables ($CLAUDE_SESSION_ID, etc.) and stdin
- The hooks are shell commands, not Node scripts — keeps it dependency-free in the target project

### MCP configuration format
- MCP server entry uses `node` command pointing to the absolute path of `packages/mcp/dist/index.js` in the AgentChat repo
- Environment variables set in the MCP config: AGENT_CHAT_DB_PATH pointing to `~/.agent-chat/data.db`, AGENT_CHAT_CWD set to the target project path
- Tenant ID set to `auto` so it auto-creates from the project directory

### Server management
- The setup script does NOT auto-start the AgentChat server
- Users start the server separately with `pnpm dev` from the AgentChat repo
- The script outputs clear instructions: "Start the AgentChat server: cd /path/to/agent-chat && pnpm dev"
- A health check (`curl http://localhost:5555/api/health`) is suggested but not enforced

### Uninstall/cleanup
- Provide a `scripts/teardown.sh` that removes AgentChat entries from `.claude/settings.json` in the target project
- Only removes AgentChat-specific hooks and MCP entries, preserves everything else

### Claude's Discretion
- Exact shell script implementation details
- Error message wording
- Whether to add color/formatting to script output
- Health check endpoint implementation if it doesn't exist yet

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/dist/index.js`: Built MCP server binary, already has `bin` entry as `agent-chat-mcp`
- `packages/server/src/hooks/handlers.ts`: Existing hook handlers for SessionStart, SessionEnd, PreToolUse, PostToolUse, Notification
- `packages/server/src/http/routes/hooks.ts`: HTTP endpoint at POST `/api/hooks/:eventType`
- `packages/mcp/src/config.ts`: Environment variable configuration (AGENT_CHAT_DB_PATH, AGENT_CHAT_TENANT_ID, AGENT_CHAT_AGENT_ID, AGENT_CHAT_AGENT_NAME, AGENT_CHAT_CWD)
- `packages/server/src/db/config.ts`: Default DB path at `~/.agent-chat/data.db`

### Established Patterns
- MCP server uses env vars for all configuration — no config files needed
- Tenant auto-creation from cwd path (upsertByCodebasePath)
- Hook endpoint accepts JSON with session_id and cwd as required fields
- Server defaults to port 5555
- WAL mode allows concurrent server + MCP access to same SQLite DB

### Integration Points
- Target project's `.claude/settings.json` — hooks and mcpServers sections
- AgentChat server must be running on localhost:5555 for hooks to work
- MCP server binary at `packages/mcp/dist/index.js` must be built before setup
- Shared SQLite DB at `~/.agent-chat/data.db` — both server and MCP access concurrently via WAL mode

</code_context>

<specifics>
## Specific Ideas

- The setup should feel like `npx create-react-app` — run one command, get working config
- The script should print a clear summary at the end: what was configured, how to start the server, how to verify it works
- Include a "test it" step: "Open Claude Code in your project and send a message — you should see it in the AgentChat web UI"
- The setup should work with the AgentChat repo cloned anywhere on the filesystem — it uses absolute paths

</specifics>

<deferred>
## Deferred Ideas

- npm package publishing for global `npx agent-chat-setup` without local clone
- Docker-based setup for zero-build experience
- Auto-start server as a background daemon
- VS Code extension for one-click setup
- Configuration wizard with interactive prompts

</deferred>

---

*Phase: 08-add-process-and-ability-to-add-this-to-existing-local-codebases-to-test-this*
*Context gathered: 2026-03-07*
