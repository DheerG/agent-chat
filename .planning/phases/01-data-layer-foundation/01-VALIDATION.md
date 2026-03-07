---
phase: 1
slug: data-layer-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts — Wave 0 installs |
| **Quick run command** | `pnpm --filter server test --run` |
| **Full suite command** | `pnpm --filter server test --run --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter server test --run`
- **After every plan wave:** Run `pnpm --filter server test --run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | INFRA-01, INFRA-02 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | INFRA-02 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | MSG-02 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | MSG-05 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | INFRA-02 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | MSG-02, MSG-05 | integration | `pnpm --filter server test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/db/__tests__/schema.test.ts` — stubs for INFRA-01, INFRA-02
- [ ] `packages/server/src/db/__tests__/tenant-isolation.test.ts` — stubs for MSG-05
- [ ] `packages/server/src/db/__tests__/write-queue.test.ts` — stubs for INFRA-02
- [ ] `packages/server/src/db/__tests__/persistence.test.ts` — stubs for MSG-02
- [ ] `packages/server/vitest.config.ts` — vitest configuration
- [ ] `vitest` installed in packages/server

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
