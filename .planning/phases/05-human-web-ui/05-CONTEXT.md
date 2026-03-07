# Phase 5: Human Web UI - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

React SPA giving humans live visibility into agent conversations with full interaction. Humans can view all channels grouped by tenant, watch messages arrive in real-time via WebSocket, send messages into channels, expand threaded conversations, see tool-call events as collapsible cards, and see agent active/idle status. No document/canvas support (Phase 6). No search or filtering (v2).

Requirements: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06

</domain>

<decisions>
## Implementation Decisions

### Application Shell and Layout
- Slack-like three-column layout: tenant/channel sidebar (left) | message feed (center) | thread panel (right, conditionally shown)
- Sidebar shows tenants as collapsible groups with channels nested underneath — matches UI-03
- Thread panel slides open on the right when a threaded message is clicked — matches UI-04
- Single-page app with no routing library needed — all navigation is state-driven (select tenant, select channel, open thread)
- Responsive but desktop-first — this is a local dev tool used alongside an IDE

### Technology Stack
- React 18+ with TypeScript — consistent with project's TypeScript-everywhere constraint
- Vite for dev server and build tooling — fast, modern, zero-config for React+TS
- New `packages/client` package in the monorepo
- Plain CSS Modules or Tailwind CSS for styling — Claude's discretion on which
- No state management library (Redux, Zustand) — React useState/useReducer + context is sufficient for this scale
- Native WebSocket API in the browser — no socket.io client needed (server uses raw `ws`)
- fetch API for REST calls (loading initial history, sending messages)

### Message Feed (UI-01)
- Messages displayed in chronological order (oldest at top, newest at bottom)
- Auto-scroll to bottom on new messages when user is already at the bottom; show "N new messages" indicator if scrolled up
- Load last 50 messages via REST on channel select, then switch to WebSocket live push
- Each message shows: sender avatar (initials-based, color-coded by sender), sender name, timestamp (relative like "2m ago"), and content
- Human messages visually distinct from agent messages (different background color or alignment)
- System messages (senderType: 'system') rendered as centered, muted text (like "Session started")

### Message Composition (UI-02)
- Text input at the bottom of the message feed — standard chat input pattern
- Send on Enter, Shift+Enter for newline
- Sender identity is "Human" with senderType: 'human' — no login required (local tool, implicit trust)
- Messages sent via POST to the REST API (not via WebSocket) — WebSocket is for receiving, REST for sending
- Input disabled when no channel is selected

### Thread Display (UI-04)
- Thread replies shown inline in the main feed with a "N replies" summary that can be expanded
- Clicking "N replies" or a "View thread" action opens the thread panel on the right
- Thread panel shows the parent message at the top followed by all replies
- Thread panel has its own compose input for replying to the thread
- Thread replies also arrive via WebSocket (they have parentMessageId set) — the client routes them to the thread panel if open

### Tool-Call Event Cards (UI-05)
- Messages with messageType: 'event' rendered as collapsible cards, visually distinct from text messages
- Card shows: tool name (from metadata), collapsed by default
- Expanding shows: tool arguments (pretty-printed JSON) and result summary if available (PostToolUse)
- Cards use a different background (subtle gray or blue tint) and a wrench/tool icon
- PreToolUse and PostToolUse can be paired visually if both exist for the same invocation

### Agent Status Indicators (UI-06)
- Each agent message in the feed shows a colored dot next to the sender name: green for active, gray for idle
- Agent status comes from the presence table — fetched via REST on channel load, updated when hook events arrive
- Sidebar can show active agent count per channel as a secondary indicator
- Presence data polled periodically (every 30s) or updated via a presence WebSocket event if available

### Claude's Discretion
- Exact color palette and visual design tokens
- Component library choice (plain HTML elements vs headless UI components)
- CSS approach (CSS Modules vs Tailwind — either is fine)
- Avatar color generation algorithm
- Exact loading skeleton design
- Error boundary and error state UI
- Vite configuration details
- Whether to use React Query/SWR for REST fetching or plain useEffect+fetch
- Animation/transition choices for thread panel open/close
- Keyboard shortcuts beyond Enter/Shift+Enter

</decisions>

<specifics>
## Specific Ideas

- Layout should feel like Slack or Discord — familiar three-panel chat layout that developers already understand
- Message feed should feel alive — real-time updates without any page refresh, messages appearing instantly
- Tool-call cards should make agent activity observable — the whole point is humans can see what agents are doing
- Keep it minimal and functional — this is a dev tool, not a consumer product. Clarity over polish
- The server already has all the APIs needed: REST endpoints for CRUD, WebSocket for live push. The client just consumes them
- Use the existing WebSocket wire protocol from Phase 4 (subscribe/unsubscribe/message/catchup) — no server changes needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@agent-chat/shared` types (`Message`, `Channel`, `Tenant`, `Presence`, `PaginationOpts`) — used directly in the client for type safety
- WebSocket wire protocol types (`WsClientMessage`, `WsServerMessage`, `WsSubscribeMessage`) — client implements the other side of this protocol
- REST API endpoints already working: `GET /api/tenants`, `GET /api/tenants/:id/channels`, `GET .../messages`, `POST .../messages`
- Health check endpoint: `GET /health` — client can use this for connection status

### Established Patterns
- All IDs are ULIDs — client handles them as opaque strings
- Cursor-based pagination with `after` ULID — client uses this for loading older messages
- JSON wire protocol over WebSocket — client sends/receives JSON text frames
- Tenant-scoped WebSocket: connect to `ws://localhost:{port}/ws?tenantId={id}`, then subscribe to channels
- Error shape `{ error: string, code: string }` — client can handle uniformly
- Messages are append-only and immutable — no need for edit/delete UI

### Integration Points
- Client connects to same port as REST API (default 3000) for both HTTP and WebSocket
- Hono server needs to serve the client's static build files in production (or client uses Vite dev server proxying to API in development)
- No CORS needed — same origin (same port) in production; Vite proxy handles dev
- WebSocket reconnection: client sends `lastSeenId` on reconnect to get catch-up messages

</code_context>

<deferred>
## Deferred Ideas

- Document/canvas viewing alongside messages — Phase 6 (DOC-03)
- Message search across channels — v2 feature (UI-07)
- Message filtering by agent, type, or time range — v2 feature (UI-08)
- Markdown rendering in messages — nice-to-have, not blocking v1
- Syntax highlighting for code in messages — nice-to-have
- Dark mode / theme switching — future enhancement
- Desktop notifications for new messages — explicitly out of scope
- Message reactions / emoji responses — v2 feature

</deferred>

---

*Phase: 05-human-web-ui*
*Context gathered: 2026-03-07*
