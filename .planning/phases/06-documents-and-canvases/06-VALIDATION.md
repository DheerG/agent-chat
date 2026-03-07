---
phase: 6
slug: documents-and-canvases
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (per package) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `cd packages/server && npx vitest run && cd ../mcp && npx vitest run && cd ../client && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose` in the relevant package
- **After every plan wave:** Run full suite across server, mcp, and client packages
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DOC-04 | unit | `cd packages/server && npx vitest run src/db/__tests__/documents.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DOC-04 | unit | `cd packages/server && npx vitest run src/db/__tests__/documents.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | DOC-01,DOC-02 | unit | `cd packages/server && npx vitest run src/db/__tests__/documents.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | DOC-01,DOC-02 | integration | `cd packages/server && npx vitest run src/http/__tests__/documents.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | DOC-01,DOC-02 | integration | `cd packages/mcp && npx vitest run src/__tests__/document-tools.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | DOC-02 | integration | `cd packages/server && npx vitest run src/http/__tests__/documents.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | DOC-03 | component | `cd packages/client && npx vitest run src/__tests__/DocumentPanel.test.tsx` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | DOC-02,DOC-03 | component | `cd packages/client && npx vitest run src/__tests__/DocumentPanel.test.tsx` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `packages/server/src/db/__tests__/documents.test.ts` — stubs for DOC-04 (schema, persistence)
- [ ] `packages/server/src/http/__tests__/documents.test.ts` — stubs for DOC-01, DOC-02 (REST routes)
- [ ] `packages/mcp/src/__tests__/document-tools.test.ts` — stubs for DOC-01, DOC-02 (MCP tools)
- [ ] `packages/client/src/__tests__/DocumentPanel.test.tsx` — stubs for DOC-03 (UI component)

*Wave 0 test stubs are created as part of each plan's first task.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Document update visible in web UI without refresh | DOC-02 | Requires browser + WebSocket observation | 1. Open UI, select channel. 2. Update document via MCP/API. 3. Verify content change appears without refresh. |
| Documents visible alongside message feed | DOC-03 | Layout/visual verification | 1. Open UI, select channel with documents. 2. Verify documents panel visible next to messages. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
