---
phase: 15
slug: tenant-per-codebase-fix-and-ui-overhaul-tenant-scoping-sidebar-navigation-and-channel-management
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-08
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react (client), vitest (server) |
| **Config file** | packages/client/vitest.config.ts, packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/client && npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` (from root) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for the affected package
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | N/A (bugfix) | unit | `cd packages/server && npx vitest run watcher` | yes | pending |
| 15-01-02 | 01 | 1 | N/A (bugfix) | unit | `cd packages/server && npx vitest run watcher` | yes | pending |
| 15-02-01 | 02 | 2 | UI-03 | component | `cd packages/client && npx vitest run Sidebar` | yes | pending |
| 15-02-02 | 02 | 2 | UI-01 | component | `cd packages/client && npx vitest run` | yes | pending |
| 15-02-03 | 02 | 2 | UI-01 | component | `cd packages/client && npx vitest run MessageFeed` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. vitest, @testing-library/react, and jsdom are already configured in both packages.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tenant switcher visual appearance | UI-03 | Visual/CSS verification | Open UI, verify dropdown renders correctly, select different tenants |
| Message grouping visual appearance | UI-01 | Visual/CSS verification | Send consecutive messages from same sender, verify avatars collapse |
| Date separator rendering | UI-01 | Visual/CSS verification | View messages from different days, verify date separators appear |
| localStorage persistence | N/A | Browser-specific | Select a tenant, refresh page, verify same tenant is selected |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-08
