# Phase 16: npx-based Install and Uninstall Scripts - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Create npx-runnable `install` and `uninstall` CLI commands that configure Claude Code hooks and MCP server entries for AgentChat. Supports two modes: global install (hooks in `~/.claude/settings.json`, MCP in `~/.claude/.mcp.json`) and project install (hooks in `<project>/.claude/settings.json`, MCP in `<project>/.mcp.json`). Reuses existing merge-settings.cjs logic.

</domain>

<decisions>
## Implementation Decisions

### CLI entry point
- Single Node.js CLI file at `bin/cli.js` with `#!/usr/bin/env node` shebang
- `bin` field in root package.json: `"bin": { "agent-chat": "./bin/cli.js" }`
- Supports `npx agent-chat install` and `npx agent-chat uninstall`
- Written in plain CJS (CommonJS) like merge-settings.cjs — no build step needed

### Argument parsing
- Custom arg parsing (no dependencies) — same pattern as merge-settings.cjs uses
- Subcommands: `install`, `uninstall`
- Flags: `--global` / `-g`, `--project <path>` / `-p <path>`
- Default (no flags): project install using current working directory
- `--help` flag prints usage

### Global install behavior
- Hooks go in `~/.claude/settings.json` under `hooks` key
- MCP server goes in `~/.claude/.mcp.json` under `mcpServers` key
- No `AGENT_CHAT_CWD` env var — MCP server uses `process.cwd()` at runtime
- Creates `~/.claude/` directory if it doesn't exist

### Project install behavior
- Hooks go in `<project>/.claude/settings.json` under `hooks` key
- MCP server goes in `<project>/.mcp.json` under `mcpServers` key (NOT in settings.json — mcpServers is not valid in settings.json per Claude Code schema)
- Sets `AGENT_CHAT_CWD` env var to the project path

### MCP binary path resolution
- CLI resolves the path to `packages/mcp/dist/index.js` relative to its own location (`__dirname`)
- `path.resolve(__dirname, '..', 'packages', 'mcp', 'dist', 'index.js')`
- Validates that the binary exists before proceeding

### Uninstall behavior
- Removes hooks matching `localhost:5555` from the target settings.json
- Removes MCP server named `agent-chat` from the target .mcp.json (global) or .mcp.json (project)
- Preserves all other settings entries
- If file becomes empty after removal, delete the file
- If file doesn't exist, print "nothing to remove" and exit cleanly

### Reuse of merge-settings.cjs
- Import/require merge-settings.cjs functions directly from the CLI
- Refactor merge-settings.cjs to export `mergeSetup`, `mergeTeardown`, `readSettingsFile`, `writeSettingsFile`, `buildHookEntry`, `buildMcpEntry` functions
- Keep the existing CLI behavior of merge-settings.cjs (backward compatible)
- CLI calls these functions for both global and project modes

### Output style
- Colorful output using ANSI escape codes (no dependencies)
- Show what was configured and where
- Show next steps (start server, open UI)
- Similar to existing setup.sh output

### Claude's Discretion
- Exact ANSI color choices
- Error message wording
- Whether to add a `--port` flag for custom port (defer for now)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/lib/merge-settings.cjs`: Core merge logic — `mergeSetup()`, `mergeTeardown()`, `readSettingsFile()`, `writeSettingsFile()`, `buildHookEntry()`, `buildMcpEntry()`. Needs module.exports added.
- `scripts/setup.sh`: Reference for install output format and next-steps messaging
- `scripts/teardown.sh`: Reference for uninstall output and detection logic

### Established Patterns
- CommonJS modules (`.cjs`) for scripts that run without build step
- `parseArgs()` custom argument parser in merge-settings.cjs
- `AGENT_CHAT_MARKER = 'localhost:5555/api/hooks'` for detecting AgentChat entries
- `AGENT_CHAT_MCP_KEY = 'agent-chat'` for MCP server name
- Deep clone via `JSON.parse(JSON.stringify())` for immutable merge

### Integration Points
- Root `package.json` needs `bin` field added
- `merge-settings.cjs` needs functions exported (currently only runs `main()`)
- New `bin/cli.js` file created
- Project-level MCP goes to `.mcp.json` (different from current behavior which puts it in `settings.json`)

</code_context>

<specifics>
## Specific Ideas

- The CLI should work both via `npx agent-chat install --global` (when published) and `node ./bin/cli.js install --global` (local dev)
- Must handle the split between hooks (settings.json) and MCP (`.mcp.json`) for both global and project modes
- Global mode needs to write to TWO different files (settings.json for hooks, .mcp.json for MCP)
- Project mode also needs to write to TWO different files (settings.json for hooks, .mcp.json for MCP)

</specifics>

<deferred>
## Deferred Ideas

- `--port` flag for custom AgentChat port (currently hardcoded to 5555)
- `npx agent-chat start` command to start the server
- `npx agent-chat status` command to check server health
- Publishing to npm registry

</deferred>

---

*Phase: 16-npx-based-install-and-uninstall-scripts-for-global-and-project-specific-mcp-and-hooks-config*
*Context gathered: 2026-03-08*
