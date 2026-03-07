---
phase: 8
slug: add-process-and-ability-to-add-this-to-existing-local-codebases-to-test-this
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-07
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash script testing (manual) + vitest for merge-settings unit tests |
| **Config file** | packages/server/vitest.config.ts (existing) |
| **Quick run command** | `bash scripts/setup.sh --dry-run /tmp/test-project` |
| **Full suite command** | `pnpm test && bash scripts/test-setup.sh` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run setup script with dry-run against temp directory
- **After every plan wave:** Run full test suite + integration test script
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | Setup script | integration | `bash scripts/test-setup.sh` | W0 | pending |
| 08-01-02 | 01 | 1 | JSON merge | unit | `node scripts/lib/merge-settings.cjs --test` | W0 | pending |
| 08-01-03 | 01 | 1 | Teardown | integration | `bash scripts/test-setup.sh` | W0 | pending |
| 08-01-04 | 01 | 1 | Idempotency | integration | `bash scripts/test-setup.sh` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `scripts/test-setup.sh` — integration test for setup/teardown scripts
- [ ] Test temp directory creation and cleanup

*Existing test infrastructure (vitest) covers server-side code. New scripts need their own test harness.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code hooks fire correctly | Hook integration | Requires running Claude Code session | 1. Run setup on test project 2. Start AgentChat server 3. Open Claude Code in test project 4. Verify events in web UI |
| MCP tools available in Claude Code | MCP integration | Requires running Claude Code with MCP | 1. Run setup on test project 2. Start AgentChat server 3. Open Claude Code 4. Verify MCP tools listed |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
