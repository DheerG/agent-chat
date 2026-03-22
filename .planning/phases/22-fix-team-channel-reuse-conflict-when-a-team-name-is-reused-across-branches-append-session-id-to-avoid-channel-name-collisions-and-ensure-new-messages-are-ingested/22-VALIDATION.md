---
phase: 22
slug: fix-team-channel-reuse-conflict
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts`
- **After every plan wave:** Run `cd packages/server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | session-detection | unit | `npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | yes | pending |
| 22-01-02 | 01 | 1 | channel-disambiguation | unit | `npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | yes | pending |
| 22-01-03 | 01 | 1 | dedup-cleanup | unit | `npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | yes | pending |
| 22-01-04 | 01 | 1 | no-regression | integration | `npx vitest run` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TeamInboxWatcher test file already has helpers (writeTeamConfig, writeInbox) for creating test team directories.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real team reuse scenario | end-to-end | Requires actual Claude team creation | Create team, delete, recreate with same name, verify new channel in UI |

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-22
