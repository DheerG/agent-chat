# Phase 5: Human Web UI - Research

**Researched:** 2026-03-07
**Phase:** Human Web UI
**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, UI-06

## Validation Architecture

### Success Criteria Mapping

| # | Success Criterion | Validation Method | Key Signals |
|---|------------------|-------------------|-------------|
| SC1 | Channels grouped by tenant in sidebar, switchable | Integration test: render sidebar, verify tenant groups and channel click | Sidebar renders tenant headings with nested channels; clicking channel updates main feed |
| SC2 | Channel loads 50 messages + live push | Integration test: mount feed, verify REST fetch + WebSocket message arrival | Initial fetch returns messages array; WS message event appends to feed |
| SC3 | Human sends message, appears in feed | Integration test: type in input, submit, verify message appears with senderType='human' | POST to REST API succeeds; message appears in feed via WS broadcast |
| SC4 | Threaded conversation expandable | Integration test: click thread indicator, verify thread panel opens with replies | Thread panel renders parent + replies; thread reply via WS routes correctly |
| SC5 | Tool-call events as collapsible cards | Unit test: render event message, verify card structure and expand/collapse | Event messages render distinctly; collapse toggle shows/hides details |
| SC6 | Agent active/idle indicator | Integration test: verify presence dot color matches agent status | Green dot for active, gray for idle; presence fetched from REST API |

### Requirement Coverage

| Req ID | Description | Addressed By |
|--------|-------------|-------------|
| UI-01 | View live message feed | SC2 — REST initial load + WebSocket live push |
| UI-02 | Send messages into channels | SC3 — Compose input + REST POST |
| UI-03 | Channels grouped by tenant in sidebar | SC1 — Sidebar with tenant grouping |
| UI-04 | Expand threaded conversations | SC4 — Thread panel with parent + replies |
| UI-05 | Tool-call events as collapsible cards | SC5 — Event message rendering |
| UI-06 | Agent active/idle indicators | SC6 — Presence dot indicators |

## 1. Technology Stack

### React + Vite + TypeScript

The project is TypeScript full-stack. For the client:

- **Vite** is the build tool — fast HMR, native ESM, React plugin available
- **React 18** with functional components and hooks
- New `packages/client` package in the monorepo
- Package references: `@agent-chat/shared` for types (Message, Channel, Tenant, Presence)

### CSS Approach

- **CSS Modules** is the simplest approach — no additional dependencies, good scoping
- Alternatively, a minimal CSS file per component
- No CSS framework needed — the UI is relatively simple (sidebar + feed + thread panel)

### No Heavy Dependencies

- No state management library — React's built-in useState, useReducer, useContext sufficient for this scale
- No React Router — single-page with state-driven navigation (select tenant, select channel)
- No component library — plain HTML elements styled with CSS
- No React Query/SWR — custom hooks with fetch are fine for a local tool

## 2. API Integration

### REST Endpoints (Already Working)

The client consumes these existing endpoints:

| Method | Endpoint | Response Shape | Used For |
|--------|----------|---------------|----------|
| GET | /api/tenants | `{ tenants: Tenant[] }` | Sidebar: list all tenants |
| GET | /api/tenants/:id/channels | `{ channels: Channel[] }` | Sidebar: list channels for tenant |
| GET | /api/tenants/:tid/channels/:cid/messages | `{ messages: Message[], pagination: {...} }` | Feed: load message history |
| POST | /api/tenants/:tid/channels/:cid/messages | `{ message: Message }` | Compose: send message |
| GET | /health | `{ status: "ok" }` | Connection status |

### Missing REST Endpoint: Presence

There is NO REST endpoint for presence currently. The client needs:
- `GET /api/tenants/:tenantId/channels/:channelId/presence` → `{ presence: Presence[] }`

This must be added to the server as part of Phase 5 (minor server-side addition to support UI-06).

### WebSocket Protocol (Already Working)

Client connects: `ws://localhost:PORT/ws?tenantId=TENANT_ID`

Client sends:
- `{ type: "subscribe", channelId: "...", lastSeenId?: "..." }` — join channel
- `{ type: "unsubscribe", channelId: "..." }` — leave channel
- `{ type: "ping" }` — keepalive

Server sends:
- `{ type: "message", message: Message }` — live message push
- `{ type: "catchup", messages: Message[], hasMore: boolean }` — reconnect backfill
- `{ type: "subscribed", channelId: "..." }` — confirmation
- `{ type: "error", error: "...", code: "..." }` — error

### Serving Strategy

Two options:
1. **Development**: Vite dev server on port 5173, proxy `/api` and `/ws` to server on port 3000
2. **Production**: Build client to `dist/`, serve static files from Hono server

For v1, the dev proxy approach is sufficient. Production static serving can be added later.

## 3. Component Architecture

### Layout Components

```
App
├── Sidebar
│   ├── TenantGroup (per tenant)
│   │   ├── TenantHeader (tenant name, collapsible)
│   │   └── ChannelItem[] (channel name, click to select)
│   └── ConnectionStatus (health indicator)
├── MessageFeed
│   ├── MessageList (scrollable)
│   │   ├── TextMessage (senderType: agent|human)
│   │   ├── SystemMessage (senderType: system)
│   │   ├── EventCard (messageType: event, collapsible)
│   │   └── ThreadIndicator (reply count, click to open)
│   ├── NewMessageIndicator ("N new messages" when scrolled up)
│   └── ComposeInput (text input + send button)
└── ThreadPanel (conditionally shown)
    ├── ParentMessage
    ├── ReplyList
    └── ComposeInput (thread reply)
```

### Custom Hooks

- `useTenants()` — fetch tenants on mount, return list
- `useChannels(tenantId)` — fetch channels when tenant selected
- `useMessages(tenantId, channelId)` — fetch initial messages, manage message list
- `useWebSocket(tenantId)` — single WS connection per tenant, subscribe/unsubscribe to channels
- `usePresence(tenantId, channelId)` — fetch agent presence, poll periodically
- `useAutoScroll(ref, messages)` — auto-scroll to bottom when new messages arrive (unless scrolled up)

## 4. WebSocket Client Strategy

### Connection Lifecycle

1. When a tenant is selected, open WS: `new WebSocket(ws://localhost:PORT/ws?tenantId=TENANT_ID)`
2. When channel selected, send subscribe: `{ type: "subscribe", channelId }`
3. When switching channels, unsubscribe old + subscribe new
4. When switching tenants, close WS and open new one
5. On WS close/error, reconnect with exponential backoff (1s, 2s, 4s, max 30s)
6. On reconnect, re-subscribe with `lastSeenId` for catch-up

### Message Routing

Messages from WS arrive as `{ type: "message", message: Message }`:
- If `message.channelId` matches current channel AND `message.parentMessageId` is null → append to main feed
- If `message.channelId` matches current channel AND `message.parentMessageId` is set → update thread indicator count; if thread panel is open for this thread, append to thread replies
- Messages for subscribed-but-not-active channels → update unread count in sidebar

## 5. Thread Panel Design

- Thread indicator in the main feed shows: "N replies" link
- Clicking opens a side panel (right side, ~350px wide)
- Thread panel shows parent message at top, replies below, compose input at bottom
- Thread replies sent with `parentMessageId` set to the parent message ID
- Thread panel subscribes to same channel WS — filters for matching parentMessageId
- Closing thread panel returns to single-panel layout

## 6. Event Card Design

Messages with `messageType: 'event'` contain tool-call information:
- `metadata.toolName` — the tool being called
- `metadata.arguments` — tool arguments (JSON)
- `metadata.result` — tool result summary (on PostToolUse)
- `senderType: 'hook'`

Card rendering:
- Default: collapsed, shows tool name + icon
- Expanded: shows arguments as formatted JSON, result if available
- Background: subtle blue-gray tint to distinguish from chat messages
- Optional: pair PreToolUse + PostToolUse for same tool invocation (match by metadata)

## 7. Presence Indicator Design

- Each message from an agent shows a small dot next to sender name
- Color: green = active, gray = idle
- Presence data fetched via REST when entering a channel
- Refreshed on a 30-second interval
- Data shape: `Presence { agentId, tenantId, channelId, status: 'active'|'idle', lastSeenAt }`
- Match by senderId === presence.agentId

## 8. Server-Side Additions Required

### Presence REST Route (New)

Add `GET /api/tenants/:tenantId/channels/:channelId/presence`:
- Returns `{ presence: Presence[] }`
- Uses existing `PresenceService.getByChannel()`
- Add route to `packages/server/src/http/routes/` and register in `app.ts`

### Static File Serving (Optional for v1)

For production builds, Hono can serve static files:
```typescript
import { serveStatic } from '@hono/node-server/serve-static';
app.use('/*', serveStatic({ root: '../client/dist' }));
```

For development, Vite proxy is sufficient — no server changes needed.

## 9. Build and Dev Configuration

### Vite Config

```typescript
// packages/client/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    }
  }
});
```

### Package Setup

```json
{
  "name": "@agent-chat/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-chat/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "~5.8.0",
    "vite": "^6.0.0",
    "vitest": "^3.2.1",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0"
  }
}
```

## 10. Testing Strategy

### Unit Tests (Vitest + React Testing Library)
- Component rendering tests: verify each component renders correct structure
- Hook tests: verify data fetching, state management, WebSocket integration
- Event card expand/collapse behavior

### Integration Tests
- Full app render with mock data
- Sidebar → channel selection → message feed flow
- Send message → appears in feed
- WebSocket message → appears in feed

### Test Environment
- Vitest with `jsdom` environment
- Mock `fetch` for REST API calls
- Mock `WebSocket` for WS tests
- Test data factories for Message, Channel, Tenant, Presence

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebSocket reconnection gaps | Lost messages during reconnect | Use lastSeenId cursor for catch-up on reconnect |
| Large message history scroll perf | Slow UI with 1000+ messages | Keep only last 200 messages in state, load more on scroll up |
| Presence polling overhead | Extra REST calls every 30s | Polling is lightweight (single GET per channel), acceptable for local tool |
| Thread panel layout complexity | CSS layout challenges | Keep simple — fixed sidebar, flex main area, conditional right panel |
| Type sharing across packages | Build order issues | @agent-chat/shared already works with project references |

## RESEARCH COMPLETE

Research covers all 6 requirements (UI-01 through UI-06), identified the missing presence REST endpoint, defined the component architecture, and outlined testing strategy. Ready for planning.

---

*Phase: 05-human-web-ui*
*Research completed: 2026-03-07*
