---
phase: 08
status: passed
verified: 2026-03-07
---

# Phase 8 Verification: Add to Existing Codebases

## Phase Goal
Create setup and teardown scripts that wire any local codebase into a running AgentChat instance, so Claude Code agents in that project can communicate through AgentChat via hooks and MCP tools.

## Success Criteria Results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Running setup.sh creates .claude/settings.json with correct hooks and MCP server entries | PASSED | Integration test "Fresh setup" verifies all 4 hook events and MCP server with correct env vars |
| 2 | Setup is idempotent — running twice produces same result | PASSED | Integration test "Idempotent setup" runs setup twice and compares JSON output |
| 3 | Setup merges with existing .claude/settings.json without destroying existing hooks or MCP servers | PASSED | Integration test "Merge with existing" creates settings with existing hooks/MCP, runs setup, verifies all preserved |
| 4 | Teardown removes only AgentChat entries, preserving everything else | PASSED | Integration test "Teardown selective" verifies existing hooks/MCP remain after teardown |
| 5 | All integration tests pass | PASSED | scripts/test-setup.sh: 6/6 tests pass; scripts/lib/merge-settings.cjs --test: 8/8 self-tests pass |

## Artifact Verification

| File | Exists | Purpose |
|------|--------|---------|
| scripts/setup.sh | YES | Main setup script |
| scripts/teardown.sh | YES | Cleanup/uninstall script |
| scripts/lib/merge-settings.cjs | YES | JSON merge helper with self-tests |
| scripts/test-setup.sh | YES | Integration test suite |

## Regression Check

| Suite | Result |
|-------|--------|
| Server tests (112) | All pass |
| MCP tests (24) | All pass |
| Client tests (53) | 51 pass, 2 pre-existing failures (Sidebar archive tests from Phase 7 - unrelated) |
| Setup integration tests (6) | All pass |
| merge-settings self-tests (8) | All pass |

## Must-Haves Verification

- [x] Setup creates .claude/settings.json with hooks for SessionStart, SessionEnd, PreToolUse, PostToolUse
- [x] Hook entries POST to http://localhost:5555/api/hooks/:eventType with JSON from stdin
- [x] MCP server entry uses absolute path to packages/mcp/dist/index.js
- [x] MCP entry sets AGENT_CHAT_DB_PATH to ~/.agent-chat/data.db
- [x] MCP entry sets AGENT_CHAT_CWD to the target project path
- [x] Setup merges with existing settings without data loss
- [x] Setup is idempotent (no duplicates on re-run)
- [x] Teardown removes only AgentChat entries
- [x] Setup validates prerequisites (Node.js, built MCP binary)
- [x] Setup prints clear next-steps instructions

## Human Verification Notes

The following require a running AgentChat instance and Claude Code session to test end-to-end:
- Claude Code hooks actually fire and events appear in AgentChat web UI
- MCP tools are available in Claude Code after setup

These are integration verification steps, not regressions from Phase 8 code.

## Result

**PASSED** — All success criteria met. Phase 8 is complete.
