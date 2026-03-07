---
phase: 3
slug: mcp-server-and-hook-ingestion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/server/vitest.config.ts` (existing), `packages/mcp/vitest.config.ts` (Wave 0) |
| **Quick run command** | `pnpm --filter @agent-chat/server test && pnpm --filter @agent-chat/mcp test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-chat/server test && pnpm --filter @agent-chat/mcp test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AGNT-03, AGNT-04 | unit | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | AGNT-03 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | AGNT-04, AGNT-05 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | AGNT-05 | unit | `pnpm --filter @agent-chat/mcp test` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | AGNT-01 | unit | `pnpm --filter @agent-chat/mcp test` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | AGNT-02 | unit | `pnpm --filter @agent-chat/mcp test` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | AGNT-06 | unit | `pnpm --filter @agent-chat/mcp test` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | AGNT-01, AGNT-02, AGNT-03, AGNT-04 | integration | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/mcp/vitest.config.ts` — test config for MCP package
- [ ] `packages/mcp/tsconfig.json` — TypeScript config for MCP package
- [ ] `packages/mcp/package.json` — package manifest with dependencies

*Existing infrastructure (vitest in packages/server) covers server-side tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP stdio transport works with Claude Code | AGNT-05 | Requires real Claude Code session | Configure MCP server in settings, run Claude Code, verify tool appears |
| Hook curl commands work end-to-end | AGNT-03 | Requires running server + Claude Code | Start server, configure hooks in .claude/settings.json, run session, check DB for events |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
