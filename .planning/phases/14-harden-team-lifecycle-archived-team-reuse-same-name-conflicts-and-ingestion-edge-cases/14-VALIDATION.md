---
phase: 14
slug: harden-team-lifecycle-archived-team-reuse-same-name-conflicts-and-ingestion-edge-cases
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-08
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts src/http/__tests__/tenants.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | N/A (bugfix) | unit | `cd packages/server && npx vitest run src/http/__tests__/tenants.test.ts` | YES | pending |
| 14-01-02 | 01 | 1 | N/A (bugfix) | integration | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | YES | pending |
| 14-02-01 | 02 | 1 | N/A (hardening) | integration | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | YES | pending |
| 14-02-02 | 02 | 1 | N/A (hardening) | integration | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | YES | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — tests are added to existing test files.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
