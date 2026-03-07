---
phase: 4
slug: real-time-websocket-delivery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | packages/server/vitest.config.ts (exists from Phase 1) |
| **Quick run command** | `pnpm --filter @agent-chat/server test` |
| **Full suite command** | `pnpm --filter @agent-chat/server test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-chat/server test`
- **After every plan wave:** Run `pnpm --filter @agent-chat/server test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | MSG-03 | unit | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | MSG-03 | unit | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | MSG-03 | unit | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | MSG-03 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | MSG-03, MSG-07 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | MSG-03 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | MSG-03 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 04-03-03 | 03 | 2 | MSG-07 | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending | ✅ green | ❌ red | ⚠ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/ws/__tests__/WebSocketHub.test.ts` — unit test stubs for hub logic
- [ ] `packages/server/src/ws/__tests__/ws-integration.test.ts` — integration test stubs for end-to-end WebSocket

*Existing test infrastructure (vitest, in-memory SQLite helpers) covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sub-second latency perception | MSG-03 | Timing assertions are automated but may flake in CI | Run integration test, check timing assertion passes consistently |

*Timing test is automated but flagged as potentially flaky under load.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
