# Phase 4: Real-Time WebSocket Delivery - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

WebSocket hub with tenant-scoped broadcast and cursor-based reconnect catch-up. When a message is written (via REST API, MCP tool, or hook ingestion), all connected WebSocket clients subscribed to that channel receive it in real-time (sub-second). Clients that disconnect and reconnect use a cursor (last-seen ULID) to catch up on missed messages before switching to live push. No UI in this phase — the WebSocket server is the delivery mechanism consumed by Phase 5's browser client.

Requirements: MSG-03, MSG-07

</domain>

<decisions>
## Implementation Decisions

### WebSocket Connection Model
- Single WebSocket connection per client, multiplexed across channels
- Client connects to `ws://localhost:{port}/ws?tenantId={tenantId}` — tenant is set at connection time
- After connecting, client sends JSON subscription messages to join/leave channels: `{ type: "subscribe", channelId: "..." }` / `{ type: "unsubscribe", channelId: "..." }`
- Server tracks subscriptions per connection — a client can subscribe to multiple channels on one socket
- Tenant isolation enforced at connection time — a WebSocket connection can only subscribe to channels within its tenant
- No authentication (consistent with project constraint: local tool, implicit trust)

### Broadcast Trigger Mechanism
- Event emitter pattern: `MessageService.send()` emits a `message:created` event after successful insert
- The WebSocket hub listens for `message:created` events and broadcasts to subscribed clients
- Use Node.js built-in `EventEmitter` — no external pub/sub dependency needed for a single-process local service
- The event carries the full `Message` object (already constructed by the insert) — no second DB read needed
- Event emission is fire-and-forget from MessageService's perspective — write success is independent of broadcast success
- This keeps MessageService decoupled from WebSocket — it just emits, hub subscribes

### Reconnect Catch-Up Strategy
- Cursor-based using ULID: client sends `{ type: "subscribe", channelId: "...", lastSeenId: "01HWXYZ..." }` on reconnect
- Server queries messages with `after: lastSeenId` using the existing `MessageService.list()` pagination
- Missed messages are delivered as a batch, then client switches to live push — seamless transition
- If `lastSeenId` is omitted, client gets live-only (no history backfill on initial subscribe — that's the UI's job via REST)
- ULID cursors are already URL-safe and used throughout the system — no new cursor format needed

### Wire Protocol
- JSON text frames over WebSocket — simple, debuggable, consistent with REST API format
- Server-to-client message types:
  - `{ type: "message", message: Message }` — new message in a subscribed channel
  - `{ type: "catchup", messages: Message[], hasMore: boolean }` — batch of missed messages on reconnect
  - `{ type: "subscribed", channelId: string }` — subscription confirmation
  - `{ type: "unsubscribed", channelId: string }` — unsubscription confirmation
  - `{ type: "error", error: string, code: string }` — error response (consistent with REST error shape)
- Client-to-server message types:
  - `{ type: "subscribe", channelId: string, lastSeenId?: string }` — join a channel
  - `{ type: "unsubscribe", channelId: string }` — leave a channel
  - `{ type: "ping" }` — keepalive (server responds with `{ type: "pong" }`)
- No binary protocol — JSON is sufficient for text messaging at local-service scale
- Thread replies are delivered as regular `message` events with `parentMessageId` set — the client (Phase 5) decides how to render them

### WebSocket Server Integration
- Use the `ws` npm package (de facto Node.js WebSocket library) — Hono does not have built-in WebSocket support for `@hono/node-server`
- WebSocket upgrade handled at the Node.js HTTP server level (from `@hono/node-server`'s `serve()` return value), not inside Hono routes
- The WebSocket server shares the same HTTP port as the REST API — no separate port
- Graceful shutdown: close all WebSocket connections with a close frame before shutting down the HTTP server (extends Phase 2's SIGTERM handler)

### Hub Architecture
- `WebSocketHub` class manages all connections and subscriptions
- Internal data structures: `Map<channelId, Set<WebSocket>>` for channel subscriptions, `Map<WebSocket, { tenantId, subscribedChannels }>` for connection metadata
- Hub is instantiated once at server startup and passed the EventEmitter to listen for `message:created` events
- Hub validates tenant isolation: subscription requests are checked against the connection's tenantId
- Connection cleanup on disconnect: remove from all channel subscription sets, clean up metadata

### Claude's Discretion
- Exact `ws` library setup and upgrade handling code
- Heartbeat/ping interval timing (reasonable default like 30s)
- Whether to add a connection limit (unlikely to matter for local tool)
- Internal logging format for WebSocket events
- Whether to batch multiple rapid messages into a single frame or send individually
- Test harness setup for WebSocket integration tests

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MessageService.send()` — the insertion point where broadcast events should be emitted
- `MessageService.list()` with `after` cursor — directly usable for reconnect catch-up queries
- `createServices(db, queue)` — WebSocket hub receives the same `Services` instance
- `@hono/node-server`'s `serve()` returns a Node.js `http.Server` — can attach `ws.WebSocketServer` to it
- Shared `Message` type from `@agent-chat/shared` — used as-is in WebSocket frames
- Error shape `{ error: string, code: string }` — reused in WebSocket error frames

### Established Patterns
- `tenantId` as first argument to all queries — WebSocket enforces tenant at connection level
- ULIDs as cursors — reconnect catch-up uses the same cursor pattern as REST pagination
- Hono app + `@hono/node-server` — WebSocket upgrade happens at the node server level, not Hono
- Services are thin wrappers — hub calls `services.messages.list()` for catch-up, no new query layer needed
- Graceful shutdown pattern in `index.ts` — extend with WebSocket connection cleanup

### Integration Points
- `packages/server/src/index.ts` — modify to create `WebSocketHub`, attach to `http.Server`, wire up event emitter
- `packages/server/src/services/MessageService.ts` — add event emission on `send()` (inject emitter via constructor or service factory)
- `packages/server/src/services/index.ts` — `createServices()` may need to accept/return an event emitter
- `packages/server/src/lib.ts` — export `WebSocketHub` for potential test use
- New files: `packages/server/src/ws/WebSocketHub.ts`, `packages/server/src/ws/index.ts`

</code_context>

<specifics>
## Specific Ideas

- The WebSocket hub is a pure delivery mechanism — it does not write messages, only reads (for catch-up) and broadcasts (for live push)
- Event emitter is the lightest coupling between MessageService and WebSocket — MessageService stays testable without WebSocket, hub stays testable without MessageService
- Reconnect catch-up reuses the exact same query path as REST pagination (`after` cursor) — no new database query needed
- Thread replies flow through the same broadcast path as top-level messages — no special thread subscription needed. Clients subscribed to a channel receive all messages including thread replies
- The `ws` package is chosen over alternatives (socket.io, uWebSockets.js) because it's lightweight, has no opinions about protocol, and the project is local-only (no need for socket.io's fallback transports or uWebSockets.js's performance)

</specifics>

<deferred>
## Deferred Ideas

- Presence updates via WebSocket (agent active/idle) — Phase 5 UI concern, presence data already in DB from hooks
- Typing indicators — not in v1 scope
- WebSocket authentication/tokens — explicitly out of scope (local tool)
- Binary protocol for performance — unnecessary at local-service scale
- Channel creation/deletion notifications via WebSocket — could be useful for Phase 5 but not required by Phase 4 success criteria

</deferred>

---

*Phase: 04-real-time-websocket-delivery*
*Context gathered: 2026-03-07*
