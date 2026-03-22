---
phase: 21
slug: auto-restore-archived-channels-on-new-activity
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/http/__tests__/messages.test.ts` | Yes | pending |
| 21-01-02 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/http/__tests__/messages.test.ts` | Yes | pending |
| 21-01-03 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/hooks/__tests__/hooks.test.ts` | Yes | pending |
| 21-01-04 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | Yes | pending |
| 21-01-05 | 01 | 1 | N/A | unit | `cd packages/server && npx vitest run src/services/__tests__` | Yes | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or fixtures needed — existing test files will be modified with new/updated test cases.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
