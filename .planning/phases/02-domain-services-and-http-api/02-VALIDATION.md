---
phase: 2
slug: domain-services-and-http-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/server/package.json` (scripts.test) |
| **Quick run command** | `pnpm --filter @agent-chat/server test` |
| **Full suite command** | `pnpm --filter @agent-chat/server test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-chat/server test`
- **After every plan wave:** Run `pnpm --filter @agent-chat/server test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | INFRA-03 | integration | `pnpm --filter @agent-chat/server test -- health` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | INFRA-03 | integration | `pnpm --filter @agent-chat/server test -- tenants` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | INFRA-03, MSG-01 | integration | `pnpm --filter @agent-chat/server test -- channels` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | MSG-01, MSG-04, MSG-06 | integration | `pnpm --filter @agent-chat/server test -- messages` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | INFRA-04 | integration | `pnpm --filter @agent-chat/server test -- shutdown` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | INFRA-03 | build | `pnpm --filter @agent-chat/server typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/__tests__/health.test.ts` — integration test stubs for GET /health
- [ ] `packages/server/src/__tests__/tenants.test.ts` — integration test stubs for tenant CRUD routes
- [ ] `packages/server/src/__tests__/channels.test.ts` — integration test stubs for channel routes
- [ ] `packages/server/src/__tests__/messages.test.ts` — integration test stubs for message routes + pagination
- [ ] `pnpm add hono @hono/node-server zod --filter @agent-chat/server` — add missing dependencies

*All test files are new — Wave 0 creates them as stubs before implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SIGTERM drains in-flight messages | INFRA-04 | Requires process signal and timing | Start server, begin concurrent writes, send SIGTERM, verify no writes dropped |

*All other phase behaviors have automated verification via Vitest + Hono testClient.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
