---
phase: 24
slug: all-chats-view
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts, packages/client/vitest.config.ts |
| **Quick run command** | `npm run test --workspace=packages/server -- --run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for affected package
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | Backend query | unit | `npm run test --workspace=packages/server -- --run` | W0 | pending |
| 24-01-02 | 01 | 1 | API route | integration | `npm run test --workspace=packages/server -- --run` | W0 | pending |
| 24-01-03 | 01 | 1 | Shared type | type-check | `npm run build --workspace=packages/shared` | existing | pending |
| 24-01-04 | 01 | 1 | Client API + hook | unit | `npm run test --workspace=packages/client -- --run` | W0 | pending |
| 24-01-05 | 01 | 1 | Sidebar UI | component | `npm run test --workspace=packages/client -- --run` | W0 | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- Server tests: `packages/server/src/http/__tests__/channels.test.ts` pattern
- Client tests: `packages/client/src/__tests__/Sidebar.test.tsx` pattern
- vitest + @testing-library/react already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual dimming of archived channels | Styling | CSS visual verification | Open UI, check archived channels appear dimmed |
| Relative timestamp display | UI formatting | Visual verification | Check timestamps show "2h ago", "3d ago" etc. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
