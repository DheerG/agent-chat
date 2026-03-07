---
phase: 9
slug: ui-polish-fix-accessibility-contrast-dead-code-and-design-system-gaps-from-design-audit
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/client/vitest.config.ts |
| **Quick run command** | `pnpm --filter @agent-chat/client test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-chat/client test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | N/A | grep | `grep -c 'var(--color' packages/client/src/App.css` | ✅ | ⬜ pending |
| 09-01-02 | 01 | 1 | N/A | grep | `grep '#666\|#555' packages/client/src/components/Sidebar.css \| wc -l` | ✅ | ⬜ pending |
| 09-01-03 | 01 | 1 | N/A | grep | `grep 'position: relative' packages/client/src/components/MessageFeed.css` | ✅ | ⬜ pending |
| 09-01-04 | 01 | 1 | N/A | grep | `grep -c '#a0aec0' packages/client/src/components/MessageItem.css packages/client/src/components/ThreadPanel.css` | ✅ | ⬜ pending |
| 09-02-01 | 02 | 1 | N/A | tsc | `npx tsc --noEmit -p packages/client/tsconfig.json` | ✅ | ⬜ pending |
| 09-02-02 | 02 | 1 | N/A | tsc | `npx tsc --noEmit -p packages/client/tsconfig.json` | ✅ | ⬜ pending |
| 09-02-03 | 02 | 1 | N/A | tsc | `npx tsc --noEmit -p packages/client/tsconfig.json` | ✅ | ⬜ pending |
| 09-02-04 | 02 | 1 | N/A | grep | `grep -n 'aria-label' packages/client/src/App.tsx packages/client/src/components/ThreadPanel.tsx packages/client/src/components/Sidebar.tsx` | ✅ | ⬜ pending |
| 09-02-05 | 02 | 1 | N/A | vitest | `pnpm --filter @agent-chat/client test` | ✅ | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or config needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Contrast visually correct | WCAG AA | Visual inspection | Open UI, verify sidebar text is readable on dark background |
| Touch device archive buttons | Touch a11y | Requires touch device | Open UI on mobile/touch device, verify archive buttons are visible |
| ConfirmDialog appearance | UX polish | Visual styling | Archive a channel, verify dialog appears styled (not window.confirm) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
