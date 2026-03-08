---
phase: 13
slug: add-mcp-layer-for-agent-team-context-persistence-and-recovery
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-08
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/mcp/vitest.config.ts, packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run && cd ../mcp && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts`
- **After every plan wave:** Run `cd packages/server && npx vitest run && cd ../mcp && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | checkins table + queries | unit | `cd packages/server && npx vitest run src/db/__tests__/checkins.test.ts` | ❌ W0 | pending |
| 13-01-02 | 01 | 1 | CheckinService | unit | `cd packages/server && npx vitest run src/db/__tests__/checkins.test.ts` | ❌ W0 | pending |
| 13-01-03 | 01 | 1 | message query extensions | unit | `cd packages/server && npx vitest run src/db/__tests__/messages-extended.test.ts` | ❌ W0 | pending |
| 13-02-01 | 02 | 1 | get_team_context tool | unit | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` | ❌ W0 | pending |
| 13-02-02 | 02 | 1 | get_agent_activity tool | unit | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` | ❌ W0 | pending |
| 13-02-03 | 02 | 1 | checkin tool | unit | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` | ❌ W0 | pending |
| 13-02-04 | 02 | 1 | get_team_members tool | unit | `cd packages/mcp && npx vitest run src/__tests__/context-tools.test.ts` | ❌ W0 | pending |
| 13-02-05 | 02 | 1 | MCP tool registration | integration | `cd packages/mcp && npx vitest run` | ❌ W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/db/__tests__/checkins.test.ts` — stubs for checkin queries
- [ ] `packages/server/src/db/__tests__/messages-extended.test.ts` — stubs for new message queries
- [ ] `packages/mcp/src/__tests__/context-tools.test.ts` — stubs for new MCP tools

*Existing test infrastructure (vitest, in-memory SQLite) covers all framework needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
