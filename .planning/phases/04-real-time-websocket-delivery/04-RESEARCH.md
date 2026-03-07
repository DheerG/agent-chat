# Phase 4: Real-Time WebSocket Delivery — Research

**Researched:** 2026-03-07
**Phase Goal:** Messages and events are delivered to all subscribers in under one second, with no gaps after reconnection
**Requirements:** MSG-03, MSG-07

## RESEARCH COMPLETE

---

## 1. Technology Selection

### WebSocket Library: `ws`

The `ws` npm package (v8.x) is the right choice for this project:

- **De facto Node.js WebSocket standard** — 12M+ weekly downloads, battle-tested
- **Zero opinions about protocol** — raw WebSocket, no socket.io-style namespaces/rooms/auto-reconnect built in
- **Native integration with Node.js `http.Server`** — the `@hono/node-server` `serve()` function returns a `Server` instance that `ws.WebSocketServer` can attach to via the `server` option or manual `upgrade` handling
- **Lightweight** — no client library dependency, browser's native WebSocket API connects directly
- **TypeScript types** available via `@types/ws`

**Why not alternatives:**
- `socket.io`: Heavy, opaque protocol, auto-reconnect logic conflicts with our cursor-based catch-up design
- `uWebSockets.js`: Performance overkill for localhost, complex build (C++ addon), incompatible with Hono's node-server
- Hono's built-in WebSocket: Only works with Cloudflare Workers or Deno adapters, NOT `@hono/node-server`

### Integration with @hono/node-server

The `serve()` function from `@hono/node-server` returns a `http.Server`. The WebSocket server attaches to this:

```typescript
import { WebSocketServer } from 'ws';

const httpServer = serve({ fetch: app.fetch, port });
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  // Parse URL, extract tenantId from query string
  // Validate tenant exists
  // Complete upgrade
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
```

The `noServer: true` option gives full control over the upgrade handshake — we can validate tenant before accepting the connection.

## 2. Architecture

### Event Emitter Pattern

The broadcast trigger uses Node.js `EventEmitter`:

```
MessageService.send() → emit('message:created', message) → WebSocketHub.broadcast()
```

**Key design points:**
- `EventEmitter` is injected into the service factory, not hardcoded in MessageService
- MessageService calls `emitter.emit('message:created', message)` after successful insert
- WebSocketHub listens: `emitter.on('message:created', (msg) => this.broadcast(msg))`
- The emitter is a standard Node.js `EventEmitter` — zero external dependencies
- Fire-and-forget: if broadcast fails (no subscribers, errors), the message write still succeeds
- All message producers (REST API POST, MCP send_message, hook handlers) flow through `MessageService.send()`, so ALL messages trigger broadcasts automatically

**Where to create the emitter:**
- Created in `index.ts` at server startup
- Passed to `createServices()` which passes it to `MessageService`
- Passed to `WebSocketHub` constructor
- The emitter instance is the only coupling between MessageService and WebSocket

### WebSocket Hub Class

```typescript
class WebSocketHub {
  // Channel → subscribers
  private channels: Map<string, Set<WebSocket>>;
  // Connection → metadata
  private clients: Map<WebSocket, ClientState>;

  constructor(services: Services, emitter: EventEmitter) {
    emitter.on('message:created', (msg: Message) => {
      this.broadcastToChannel(msg.tenantId, msg.channelId, msg);
    });
  }
}
```

**ClientState tracks:**
- `tenantId`: Set at connection time, immutable
- `subscribedChannels`: Set of channelIds the client is listening to

**Tenant isolation:**
- Connection is bound to one tenant (from query param on upgrade)
- Subscribe requests validate that the channelId belongs to the connection's tenant
- `broadcastToChannel()` only sends to clients whose tenantId matches the message's tenantId

### Reconnect Catch-Up Flow

1. Client connects with `ws://host:port/ws?tenantId=XXX`
2. Client sends `{ type: "subscribe", channelId: "YYY", lastSeenId: "01HWX..." }`
3. Hub detects `lastSeenId` is present
4. Hub calls `services.messages.list(tenantId, channelId, { after: lastSeenId })`
5. Hub sends `{ type: "catchup", messages: [...], hasMore: true/false }` to client
6. If `hasMore`, client can send another subscribe with updated cursor, or accept the gap
7. After catch-up, client receives live `{ type: "message", message: {...} }` events

**Edge cases:**
- `lastSeenId` is very old (1000+ messages missed): catch-up returns limit (50) messages with `hasMore: true`. Client pages through with subsequent subscribes, each updating `lastSeenId`
- `lastSeenId` is invalid/unknown: return error frame `{ type: "error", error: "Unknown cursor", code: "INVALID_CURSOR" }`
- No `lastSeenId`: skip catch-up, live-only mode

## 3. Wire Protocol

### Server → Client Messages

| Type | Shape | When |
|------|-------|------|
| `message` | `{ type: "message", message: Message }` | New message in subscribed channel |
| `catchup` | `{ type: "catchup", messages: Message[], hasMore: boolean }` | Reconnect backfill |
| `subscribed` | `{ type: "subscribed", channelId: string }` | Subscribe confirmed |
| `unsubscribed` | `{ type: "unsubscribed", channelId: string }` | Unsubscribe confirmed |
| `error` | `{ type: "error", error: string, code: string }` | Error (reuses REST shape) |
| `pong` | `{ type: "pong" }` | Keepalive response |

### Client → Server Messages

| Type | Shape | Action |
|------|-------|--------|
| `subscribe` | `{ type: "subscribe", channelId: string, lastSeenId?: string }` | Join channel, optional catch-up |
| `unsubscribe` | `{ type: "unsubscribe", channelId: string }` | Leave channel |
| `ping` | `{ type: "ping" }` | Keepalive (server responds with pong) |

All messages are JSON text frames. No binary protocol needed for local-service scale.

## 4. Thread Handling (MSG-07)

Thread replies are regular messages with `parentMessageId` set. They flow through the same broadcast pipeline:

1. Agent sends thread reply via MCP or REST (parentMessageId = parent's ULID)
2. `MessageService.send()` inserts it, emits `message:created`
3. Hub broadcasts to all channel subscribers (thread replies belong to the channel)
4. Client receives `{ type: "message", message: { parentMessageId: "...", ... } }`
5. Client (Phase 5 UI) decides whether to render inline or in a thread panel

**No separate thread subscription needed.** All messages in a channel (including thread replies) are broadcast to channel subscribers. This is how Slack, Discord, and similar systems work.

## 5. Graceful Shutdown

The existing SIGTERM handler in `index.ts` needs extension:

```
SIGTERM received →
  1. Close WebSocketServer (sends close frame to all clients)
  2. Close HTTP server (stop accepting new connections)
  3. Drain write queue
  4. Close database
  5. Exit
```

WebSocket close must happen BEFORE HTTP server close, because HTTP server close also closes the underlying TCP connections that WebSocket connections ride on.

## 6. Testing Strategy

### Unit Tests
- `WebSocketHub` class: subscription management, broadcast routing, tenant isolation
- Can test with mock WebSocket objects (ws provides `WebSocket.OPEN` etc.)

### Integration Tests
- Full server with real WebSocket connections using `ws` client
- Start server on random port, connect WebSocket, subscribe, send message via REST, verify WebSocket receives it
- Reconnect test: connect, receive messages, disconnect, new messages posted, reconnect with lastSeenId, verify catch-up
- Tenant isolation test: two connections with different tenants, verify no cross-tenant delivery

### Test Utilities
- Helper to create server + WebSocket client pair for testing
- Helper to wait for a specific message type from WebSocket
- Use `vitest` (already configured)

## 7. Files to Create/Modify

### New Files
- `packages/server/src/ws/WebSocketHub.ts` — Hub class with subscription management and broadcast
- `packages/server/src/ws/index.ts` — Exports
- `packages/server/src/ws/__tests__/WebSocketHub.test.ts` — Unit tests for hub logic
- `packages/server/src/ws/__tests__/ws-integration.test.ts` — End-to-end WebSocket tests

### Modified Files
- `packages/server/src/services/MessageService.ts` — Add EventEmitter injection, emit on send()
- `packages/server/src/services/index.ts` — Accept EventEmitter in createServices(), pass to MessageService
- `packages/server/src/lib.ts` — Export WebSocketHub and related types
- `packages/server/src/index.ts` — Create EventEmitter, create WebSocketHub, handle upgrade, extend shutdown
- `packages/server/package.json` — Add `ws` and `@types/ws` dependencies

### No Changes Needed
- `packages/shared` — Message type already has all fields needed (parentMessageId for threads)
- `packages/mcp` — MCP already calls MessageService.send(), which will now automatically emit events
- Query layer — catch-up uses existing `getMessages()` with `after` cursor

## 8. Validation Architecture

### Success Criteria Mapping

| Criterion | Test | Validation |
|-----------|------|------------|
| SC-1: Agent message appears in all connected browser clients within 1 second | Integration test: POST message via REST, assert WebSocket receives within 1s | Automated timing assertion |
| SC-2: Reconnect catches up on missed messages, then switches to live push | Integration test: connect → disconnect → post messages → reconnect with lastSeenId → verify catchup + live | Automated sequence assertion |
| SC-3: Threaded replies delivered in real-time to channel subscribers | Integration test: POST thread reply via REST, assert WebSocket receives with parentMessageId set | Automated assertion |

### Verification Commands
- Quick: `pnpm --filter @agent-chat/server test -- --grep "WebSocket"`
- Full: `pnpm --filter @agent-chat/server test`

---

*Research complete: 2026-03-07*
*Phase: 04-real-time-websocket-delivery*
