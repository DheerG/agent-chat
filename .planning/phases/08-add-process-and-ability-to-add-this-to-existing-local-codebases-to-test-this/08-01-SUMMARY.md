# Plan 08-01 Summary: Setup and Teardown Scripts

**Phase:** 08 — Add process and ability to add this to existing local codebases
**Status:** Complete
**Executed:** 2026-03-07

## What Was Built

Created a complete setup system for wiring any local codebase into a running AgentChat instance. Users run a single script to configure Claude Code hooks and MCP server entries in their project.

### Key Files Created

| File | Purpose |
|------|---------|
| `scripts/lib/merge-settings.cjs` | Node.js helper for safely merging/removing AgentChat config in .claude/settings.json |
| `scripts/setup.sh` | Main setup script — configures hooks and MCP in target project |
| `scripts/teardown.sh` | Cleanup script — removes only AgentChat entries |
| `scripts/test-setup.sh` | Integration test suite (6 tests) |

### What Each Script Does

**setup.sh**: Takes a target project path, validates prerequisites (Node.js, built MCP server), creates `.claude/settings.json` with 4 hook entries (SessionStart, SessionEnd, PreToolUse, PostToolUse) that POST to AgentChat's HTTP server, and 1 MCP server entry pointing to the built MCP binary with correct environment variables.

**teardown.sh**: Removes AgentChat-specific hooks and MCP server entries from a project's settings, preserving all other Claude Code configuration.

**merge-settings.cjs**: The core JSON merge logic. Handles all edge cases: new file, existing file with other hooks/MCP servers, idempotent re-runs. Has 8 built-in self-tests.

## Test Results

- merge-settings.cjs self-tests: 8/8 pass
- Integration tests (test-setup.sh): 6/6 pass
- Server test suite: 112/112 pass (zero regressions)
- MCP test suite: 24/24 pass (zero regressions)

## Deviations

None. All 4 tasks completed as planned.

## Self-Check: PASSED

All must-haves verified:
- Setup creates correct .claude/settings.json with hooks and mcpServers
- Setup merges with existing settings without destroying them
- Setup is idempotent
- Hook entries POST to correct endpoints
- MCP entry uses absolute paths and correct env vars
- Teardown removes only AgentChat entries
- Prerequisites validated before proceeding

---

*Plan: 08-01*
*Completed: 2026-03-07*
