---
phase: 11
slug: team-inbox-ingestion-file-watcher-that-syncs-claude-teams-messages-into-agentchat-channels-in-real-time
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-07
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run src/watcher/__tests__/` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run src/watcher/__tests__/`
- **After every plan wave:** Run `cd packages/server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | TEAM-01 | unit | `npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | TEAM-02 | unit | `npx vitest run src/watcher/__tests__/TeamInboxWatcher.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | TEAM-03 | integration | `npx vitest run src/watcher/__tests__/integration.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | TEAM-04 | integration | `npx vitest run src/watcher/__tests__/integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/watcher/__tests__/TeamInboxWatcher.test.ts` — unit tests for watcher logic
- [ ] `src/watcher/__tests__/integration.test.ts` — integration tests with real files and services

*Existing vitest infrastructure covers framework needs. Only test files are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time messages in web UI | TEAM-05 | Requires running UI + live team | Start server, create team in Claude Code, verify messages appear in browser |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
