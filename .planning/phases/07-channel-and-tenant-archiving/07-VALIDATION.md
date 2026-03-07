---
phase: 7
slug: channel-and-tenant-archiving
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/server/vitest.config.ts`, `packages/client/vitest.config.ts` |
| **Quick run command** | `pnpm -r test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SC-1 (archive channel) | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SC-2 (archive tenant cascades) | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | SC-3 (list archived) | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | SC-4 (restore) | integration | `pnpm --filter @agent-chat/server test` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | SC-1 (sidebar archive) | component | `pnpm --filter @agent-chat/client test` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | SC-3 (archived view) | component | `pnpm --filter @agent-chat/client test` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | SC-4 (restore UI) | component | `pnpm --filter @agent-chat/client test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Archived channel disappears from sidebar visually | SC-1 | Visual rendering in browser | Archive a channel, verify it's gone from active list |
| Archived tenant hides all channels | SC-2 | Multi-component visual flow | Archive a tenant, verify all its channels are removed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
