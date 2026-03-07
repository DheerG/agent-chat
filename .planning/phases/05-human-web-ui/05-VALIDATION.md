---
phase: 5
slug: human-web-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react + jsdom |
| **Config file** | packages/client/vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `cd packages/client && pnpm test` |
| **Full suite command** | `pnpm test` (runs all packages) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/client && pnpm test`
- **After every plan wave:** Run `pnpm test` (full suite — all packages)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA | unit | `pnpm test` | ❌ W0 | pending |
| 05-01-02 | 01 | 1 | UI-03 | unit | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-02-01 | 02 | 1 | UI-01 | unit+integration | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-02-02 | 02 | 1 | UI-05 | unit | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-02-03 | 02 | 1 | UI-02 | unit | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-03-01 | 03 | 2 | UI-04 | unit+integration | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-03-02 | 03 | 2 | UI-06 | unit | `cd packages/client && pnpm test` | ❌ W0 | pending |
| 05-03-03 | 03 | 2 | UI-01,UI-02 | integration | `cd packages/client && pnpm test` | ❌ W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/client/` — Scaffold React+Vite project with vitest config
- [ ] `packages/client/src/test/setup.ts` — jsdom setup + testing-library matchers
- [ ] `packages/client/vitest.config.ts` — vitest with jsdom environment
- [ ] Test utilities: mock WebSocket, mock fetch, test data factories

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual layout matches Slack-like design | UI-03 | Visual verification needed | Open browser, verify three-panel layout |
| Auto-scroll behavior feels natural | UI-01 | UX behavior hard to test in jsdom | Scroll up, verify "new messages" indicator appears |
| WebSocket reconnection in real browser | UI-01 | Requires real network interruption | Kill server, restart, verify messages resume |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
