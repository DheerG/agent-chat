---
phase: 05-human-web-ui
plan: 01
subsystem: client-scaffold
tags: react, vite, sidebar, presence, REST

requires:
  - phase: 01-data-layer-foundation
    provides: shared types (Tenant, Channel, Message, Presence)
  - phase: 02-domain-services-and-http-api
    provides: HTTP routes, PresenceService

provides:
  - packages/client workspace with React 18, Vite, vitest + @testing-library/react
  - REST API client module (fetchTenants, fetchChannels, fetchMessages, sendMessage, fetchPresence)
  - useTenants, useChannels data-fetching hooks
  - Sidebar component with collapsible tenant/channel hierarchy
  - Presence REST endpoint on server (GET /api/.../presence)

affects: [05-02-message-feed, 05-03-thread-panel]

tech-stack:
  added: [react@18.3.1, react-dom@18.3.1, vite@6.4.1, "@vitejs/plugin-react@4.3.4", "@testing-library/react@16.3.0", "@testing-library/jest-dom@6.6.3", jsdom@26.1.0]
  patterns: [vite-proxy-to-server, workspace-dependency, hook-based-data-fetching]

key-files:
  created:
    - packages/client/package.json
    - packages/client/tsconfig.json
    - packages/client/vite.config.ts
    - packages/client/vitest.config.ts
    - packages/client/index.html
    - packages/client/src/main.tsx
    - packages/client/src/App.tsx
    - packages/client/src/App.css
    - packages/client/src/lib/api.ts
    - packages/client/src/hooks/useTenants.ts
    - packages/client/src/hooks/useChannels.ts
    - packages/client/src/components/Sidebar.tsx
    - packages/client/src/components/Sidebar.css
    - packages/client/src/__tests__/Sidebar.test.tsx
    - packages/server/src/http/routes/presence.ts
    - packages/server/src/http/__tests__/presence.test.ts
  modified:
    - packages/server/src/http/app.ts
    - tsconfig.json

key-decisions:
  - "Vite dev server proxies /api and /ws to localhost:3000 for seamless local development"
  - "REST API client uses generic fetchJson helper with error extraction"
  - "Sidebar renders TenantGroup subcomponents with collapsible channel lists"
  - "Presence endpoint follows existing Hono route pattern with 404 for unknown tenant/channel"

requirements-completed: [UI-03, UI-06]

duration: 20min
completed: 2026-03-07
---

# Phase 05-01: Client Scaffold + Sidebar + Presence Summary

**Scaffolded the React client workspace and built sidebar navigation with tenant/channel hierarchy plus server-side presence endpoint.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-03-07
- **Tasks:** 3 completed
- **Files created:** 16 (+ 2 modified)

## Accomplishments
- Created packages/client with React 18, Vite, TypeScript, vitest + jsdom + testing-library
- Built REST API client module covering all needed endpoints (tenants, channels, messages, presence)
- Created useTenants and useChannels hooks with loading/error states and cancellation
- Built Sidebar with collapsible TenantGroup subcomponents, active channel highlighting
- Added presence REST endpoint on server with 404 handling
- All tests pass: 6 client, 81 server (4 new presence tests)

## Task Commits

1. **Task 1: Scaffold packages/client** - `9786761`
2. **Task 2: REST API client and hooks** - `9786761`
3. **Task 3: Sidebar component + presence endpoint** - `9786761`

## Files Created/Modified
- `packages/client/` - Full React workspace scaffold
- `packages/client/src/lib/api.ts` - REST API client (5 endpoints)
- `packages/client/src/hooks/useTenants.ts` - Tenant list hook
- `packages/client/src/hooks/useChannels.ts` - Channel list hook (per tenant)
- `packages/client/src/components/Sidebar.tsx` - Collapsible tenant/channel nav
- `packages/server/src/http/routes/presence.ts` - GET presence endpoint
- `packages/server/src/http/app.ts` - Mount presence route
