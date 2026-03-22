---
phase: 20
slug: auto-archive-stale-channels-sessions-auto-archive-after-3-days-team-channels-archive-when-team-is-deleted
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test:all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | auto-archive query | unit | `cd packages/server && npx vitest run src/db/__tests__/channels.test.ts` | ✅ | ⬜ pending |
| 20-01-02 | 01 | 1 | auto-archive function | unit | `cd packages/server && npx vitest run src/services/__tests__/AutoArchiveService.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | team archive on delete | integration | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ✅ | ⬜ pending |
| 20-01-04 | 01 | 1 | server integration | integration | `cd packages/server && npx vitest run --reporter=verbose` | ✅ | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. The test framework (vitest) and helpers already exist.
- New test file needed: `packages/server/src/services/__tests__/AutoArchiveService.test.ts` (created during execution)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timer runs hourly in production | Periodic scheduling | Timer internals tested via mock; production interval verified by log inspection | Start server, check logs for `auto_archive_run` events |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
