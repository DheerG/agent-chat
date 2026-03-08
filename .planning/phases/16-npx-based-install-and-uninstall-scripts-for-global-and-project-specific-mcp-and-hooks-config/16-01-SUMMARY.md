# Plan 16-01 Summary

## What was built

npx-runnable CLI (`bin/cli.js`) for installing and uninstalling AgentChat hooks and MCP server configuration, supporting both global (`~/.claude/`) and project-level setups.

## Key changes

### scripts/lib/merge-settings.cjs
- Added `buildMcpEntryGlobal()` — creates MCP entry without `AGENT_CHAT_CWD`
- Added `mergeHooksOnly()` — merges only hooks (no MCP) into settings
- Added `mergeMcpOnly()` — merges only MCP server entry into config
- Added `teardownHooksOnly()` — removes only hooks from settings
- Added `teardownMcpOnly()` — removes only MCP from config
- Added `module.exports` for all functions
- Changed `main()` to only run when `require.main === module`
- Added 5 new self-tests (13 total pass)
- Full backward compatibility with existing setup.sh/teardown.sh

### bin/cli.js (new)
- `#!/usr/bin/env node` CLI entry point
- Subcommands: `install`, `uninstall`
- Flags: `--global`/`-g`, `--project`/`-p <path>`, `--help`/`-h`
- Global install: hooks in `~/.claude/settings.json`, MCP in `~/.claude/.mcp.json` (no `AGENT_CHAT_CWD`)
- Project install: hooks in `<project>/.claude/settings.json`, MCP in `<project>/.mcp.json` (with `AGENT_CHAT_CWD`)
- Validates MCP binary exists before proceeding
- Clean output with next-steps instructions

### package.json
- Added `bin.agent-chat` field pointing to `./bin/cli.js`

### scripts/test-setup.sh
- Added 6 new CLI tests (12 total):
  - CLI project install creates split files
  - CLI project install is idempotent
  - CLI project uninstall removes only AgentChat
  - CLI global install writes to correct files (mock HOME)
  - CLI global uninstall cleans up files
  - CLI --help exits 0

## Verification

- 13/13 merge-settings self-tests pass
- 12/12 integration tests pass
- 313/313 project tests pass (87 client + 178 server + 48 MCP)
- Zero regressions

## Key files

- `bin/cli.js` — CLI entry point
- `scripts/lib/merge-settings.cjs` — Shared merge logic with exports
- `package.json` — bin field added
- `scripts/test-setup.sh` — Expanded integration tests

## Commits

1. `c416a08` — feat(16): refactor merge-settings.cjs to export functions for CLI reuse
2. `2664704` — feat(16): create npx-runnable CLI for install/uninstall commands
3. `aa9b073` — test(16): add CLI integration tests for install/uninstall

## Self-Check: PASSED
