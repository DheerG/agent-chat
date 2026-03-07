# Phase 8: Add to Existing Codebases — Research

**Phase:** 08 — Add process and ability to add this to existing local codebases to test this
**Researched:** 2026-03-07
**Requirements:** None (no explicit requirement IDs — this is a developer experience phase)

---

## Summary

Phase 8 delivers a setup process that lets users wire any existing local codebase into a running AgentChat instance. When complete, Claude Code agents working in the target project will automatically send hook events and have MCP tools available for direct messaging.

The setup involves two integration points:
1. **Claude Code Hooks** — Shell commands in `.claude/settings.json` that POST lifecycle events to the AgentChat HTTP server
2. **MCP Server** — An stdio MCP server entry in `.claude/settings.json` that gives agents send_message, read_channel, list_channels, and document tools

---

## Existing Codebase Inventory

### Assets to Leverage

| Asset | Path | Usage in Phase 8 |
|-------|------|-------------------|
| Health endpoint | `packages/server/src/http/routes/health.ts` | Setup script health check: `curl http://localhost:5555/health` |
| Hook routes | `packages/server/src/http/routes/hooks.ts` | Target for hook curl commands |
| MCP server binary | `packages/mcp/dist/index.js` | MCP server entry point |
| MCP config env vars | `packages/mcp/src/config.ts` | AGENT_CHAT_DB_PATH, AGENT_CHAT_TENANT_ID, AGENT_CHAT_AGENT_ID, AGENT_CHAT_AGENT_NAME, AGENT_CHAT_CWD |
| DB default path | `packages/server/src/db/config.ts` | `~/.agent-chat/data.db` — shared between server and MCP |
| Server default port | `packages/server/src/index.ts` | Port 5555 (from PORT env var) |

### Claude Code Settings Format

The `.claude/settings.json` file supports two relevant sections:

#### hooks section
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:5555/api/hooks/SessionStart -H 'Content-Type: application/json' -d \"$(cat)\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

Key details:
- Each event type (SessionStart, PreToolUse, PostToolUse, SessionEnd) is an array of hook groups
- Each hook group has an optional `matcher` (empty string or `"*"` for catch-all) and an array of hooks
- Each hook has `type: "command"` and a `command` string
- Claude Code passes event JSON via stdin, so `$(cat)` captures it in the curl command
- The `|| true` ensures hook failures don't block Claude Code operations
- The `2>/dev/null` suppresses curl error output

#### mcpServers section
```json
{
  "mcpServers": {
    "agent-chat": {
      "command": "node",
      "args": ["/absolute/path/to/agent-chat/packages/mcp/dist/index.js"],
      "env": {
        "AGENT_CHAT_DB_PATH": "/Users/username/.agent-chat/data.db",
        "AGENT_CHAT_TENANT_ID": "auto",
        "AGENT_CHAT_AGENT_NAME": "claude-agent",
        "AGENT_CHAT_CWD": "/absolute/path/to/target-project"
      }
    }
  }
}
```

Key details:
- MCP servers use absolute paths (required since Claude Code may run from any directory)
- `command` is the executable, `args` are the arguments
- `env` sets environment variables for the subprocess
- `AGENT_CHAT_CWD` tells the MCP server which project directory to use for tenant resolution
- `AGENT_CHAT_DB_PATH` should use the home directory path for portability

### Settings Merge Strategy

The setup script must merge into existing `.claude/settings.json` without destroying user's existing hooks or MCP servers. Key considerations:

1. **If `.claude/settings.json` doesn't exist:** Create it with AgentChat config
2. **If it exists but has no hooks/mcpServers:** Add the sections
3. **If it exists with existing hooks:** Append AgentChat hook groups to existing event arrays
4. **If it exists with existing mcpServers:** Add `agent-chat` key alongside existing servers
5. **If AgentChat hooks already exist:** Skip (idempotent) — detect by checking for `agent-chat` in curl URLs

### JSON Manipulation in Shell

For merging JSON, the script should use `node` (available since this is a Node.js project). Options:
- **Best: Use a small Node.js script** — `node -e "..."` for inline JSON merge logic
- **Alternative: jq** — not guaranteed to be installed on all systems
- **Avoid: sed/awk** — fragile for JSON manipulation

Since we already require Node.js (it's needed to run the MCP server), using `node` for JSON manipulation is the safest choice.

---

## Setup Script Design

### Entry Point

`scripts/setup.sh` — A bash script that:
1. Detects the AgentChat repo location (relative to script location)
2. Takes the target project path as an argument (defaults to cwd)
3. Validates prerequisites (Node.js, pnpm, built MCP server)
4. Generates and merges Claude Code configuration
5. Prints a summary with next steps

### Arguments

```
Usage: ./scripts/setup.sh [TARGET_PROJECT_PATH]

Options:
  TARGET_PROJECT_PATH   Path to the project to configure (default: current directory)
```

### Teardown Script

`scripts/teardown.sh` — Removes AgentChat entries from `.claude/settings.json`:
1. Removes `agent-chat` from `mcpServers`
2. Removes hook entries containing `agent-chat` in the curl URL
3. Cleans up empty sections
4. Does NOT delete the `.claude/settings.json` file if other entries remain

---

## File Structure to Create

```
scripts/
├── setup.sh              # Main setup script
├── teardown.sh           # Cleanup/uninstall script
└── lib/
    └── merge-settings.cjs  # Node.js script for JSON merge logic
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Target project has incompatible `.claude/settings.json` format | Low | Use Node.js JSON parsing with try/catch, validate structure |
| AgentChat not built before setup | High | Check for `packages/mcp/dist/index.js`, prompt to build |
| Server not running when hooks fire | Medium | Hooks use `|| true` to fail silently; setup prints instructions |
| Different Node.js versions between AgentChat and target project | Low | MCP server runs from AgentChat's node_modules; target project unaffected |
| User runs setup from inside AgentChat repo | Medium | Detect and warn — setup should target a DIFFERENT project |

---

## Validation Architecture

### What Gets Validated

| Check | Where | How |
|-------|-------|-----|
| Prerequisites exist | setup.sh | Check for node, pnpm in PATH |
| MCP binary built | setup.sh | Test -f packages/mcp/dist/index.js |
| Target dir exists | setup.sh | Test -d $TARGET |
| Settings merge success | merge-settings.cjs | JSON parse + write + re-read verification |
| Server reachable | Post-setup manual check | curl http://localhost:5555/health |
| Hooks working | Post-setup manual check | Start Claude Code session, check web UI |

### Success Criteria Verification

| Criterion | Test Method |
|-----------|-------------|
| Setup script runs from any directory | Run from /tmp, verify .claude/settings.json created in target |
| Existing settings preserved | Create test settings.json with mock data, run setup, verify mock data intact |
| Idempotent | Run setup twice, verify no duplicate entries |
| Teardown removes only AgentChat entries | Run teardown after setup, verify other entries preserved |
| Server health check works | Start server, run curl, verify JSON response |

---

## RESEARCH COMPLETE

Phase 8 research complete. Setup mechanism designed as shell scripts with Node.js JSON merge helper. Claude Code settings format documented for both hooks and MCP servers. Merge strategy handles all edge cases (new file, existing file, existing hooks). Teardown script designed for clean removal.
