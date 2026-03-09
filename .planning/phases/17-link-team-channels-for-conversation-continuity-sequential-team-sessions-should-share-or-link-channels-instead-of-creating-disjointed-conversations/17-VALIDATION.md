---
phase: 17
slug: link-team-channels-for-conversation-continuity
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-09
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts`
- **After every plan wave:** Run `cd packages/server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ✅ | ⬜ pending |
| 17-01-03 | 01 | 1 | N/A | integration | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ✅ | ⬜ pending |
| 17-01-04 | 01 | 1 | N/A | regression | `cd packages/server && npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
