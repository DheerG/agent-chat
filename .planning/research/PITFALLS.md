# Pitfalls Research

**Domain:** Local multi-tenant agent messaging service (TypeScript, MCP, WebSocket, SQLite)
**Researched:** 2026-03-07
**Confidence:** HIGH (multiple authoritative sources, domain-specific verification)

---

## Critical Pitfalls

### Pitfall 1: MCP stdio stdout Pollution Crashes the Protocol

**What goes wrong:**
Any `console.log()` call inside the MCP server immediately corrupts the JSON-RPC protocol stream and crashes the connection. The MCP stdio transport uses stdout exclusively as the message channel. A single stray debug log renders the server non-functional with a cryptic parse error on the client side.

**Why it happens:**
Developers use `console.log()` instinctively for debugging. During MCP server development, this habit destroys the transport without any clear error message explaining why.

**How to avoid:**
Configure all logging to stderr before writing a single line of MCP server code. Use `console.error()` or configure a logger like `pino` with `destination: process.stderr`. Establish a lint rule or eslint plugin that flags `console.log` inside any file in the MCP server module. Never use `process.stdout.write()` directly except through the MCP SDK's transport layer.

**Warning signs:**
- MCP client reports parse errors or malformed JSON immediately on startup
- Agent tools appear to register but immediately fail on first invocation
- Debugging shows partial JSON responses in the stdout stream

**Phase to address:**
Phase 1 (MCP Server Foundation) — Establish the logging pattern before any feature development begins.

---

### Pitfall 2: SQLite Write Contention Under Agent Concurrency

**What goes wrong:**
Multiple agents writing messages simultaneously cause `SQLITE_BUSY` / "database is locked" errors. Even with WAL mode, only one writer can hold the lock at a time. When an agent team is active — multiple agents sending messages, updating channel state, and writing documents concurrently — lock collisions cascade into dropped messages or crashes.

**Why it happens:**
SQLite's WAL mode solves read/write contention but not write/write contention. Developers enable WAL mode and assume concurrency is solved. Long-running transactions (e.g., inserting a message then updating channel metadata in a single transaction that also reads other state) hold the write lock for an extended duration, blocking all other writers.

**How to avoid:**
Enable WAL mode and set `busy_timeout` to at least 5000ms. Use an application-level write serialization queue (a single async queue that processes all writes sequentially). Keep transactions as short as possible — one statement per transaction where feasible. Never hold a write transaction open during I/O operations. Use `BEGIN IMMEDIATE` for read-then-write patterns. For the local concurrency levels of an agent team (single machine, typically 2-10 agents), an in-process write queue is sufficient and eliminates lock errors entirely.

**Warning signs:**
- `SQLITE_BUSY` errors appearing in logs under normal agent activity
- Message delivery inconsistency — some messages missing from channel reads
- Increasing latency on write operations as agent count grows

**Phase to address:**
Phase 1 (Data Layer Foundation) — Establish WAL mode, busy_timeout, and the write queue pattern as core infrastructure before any feature builds on top.

---

### Pitfall 3: Agent Tool Loops — Self-Invoking MCP Tools

**What goes wrong:**
An agent calls a `send_message` tool, the message triggers a hook or event that the same agent processes, which causes the agent to call `send_message` again, creating an infinite loop that fills the database with duplicate messages, consumes all available tokens, and requires manual process kill to stop.

**Why it happens:**
Agent frameworks process incoming messages as prompts. If an agent receives its own outgoing messages as new context, it may interpret them as instructions and respond. This is especially dangerous when Claude Code hooks passively capture all messages including the agent's own outputs and re-inject them as tool context.

**How to avoid:**
Tag every message with the originating agent's identity (session ID or agent ID). In the MCP `read_channel` tool response, always filter out messages sent by the caller. In the hook capture system, implement a deduplication mechanism using message IDs so the same message is never delivered to the same agent twice. Implement a per-agent message rate limiter (e.g., max 10 messages per minute) as a circuit breaker.

**Warning signs:**
- Rapidly growing message count in a channel within seconds
- An agent's messages all following the same template (evidence of copy-loop)
- CPU spike from the agent process alongside database write volume spike
- Memory growth in the service process as the message queue fills

**Phase to address:**
Phase 2 (MCP Tool Design) — The agent identity model and message attribution must be defined before tools are implemented, not retrofitted.

---

### Pitfall 4: Tenant Isolation Leakage via Shared Async Context

**What goes wrong:**
Messages from one tenant (codebase) are visible in another tenant's channel reads. This happens when tenant context (the codebase identifier) is stored in a shared variable, module-level singleton, or async context that bleeds across concurrent requests.

**Why it happens:**
In Node.js async code, global variables and module-level state are shared across all concurrent requests. If tenant ID is set on a shared object rather than passed explicitly through the call chain, an async context switch between two simultaneous MCP tool calls from different tenants can cause one tenant's ID to be applied to another's query.

**How to avoid:**
Never store the current tenant ID in module-level state. Pass tenant ID explicitly as a function parameter through the entire call chain, from MCP tool handler through the service layer to the database query. All database queries must include `WHERE tenant_id = ?` as a mandatory condition — enforce this at the query builder level, not per-query developer discipline. Write an integration test that makes simultaneous calls from two different tenants and asserts no cross-contamination.

**Warning signs:**
- Channels showing messages that don't belong to the active session
- Agents reading tasks or context from a different codebase's workspace
- Intermittent (not consistent) cross-tenant data appearing — suggests race condition rather than logic bug

**Phase to address:**
Phase 1 (Multi-Tenant Data Model) — Tenant isolation must be built into the schema and query layer from the first migration, not added later.

---

### Pitfall 5: WebSocket Reconnection Without Message Gap Recovery

**What goes wrong:**
When a human UI client reconnects after a network interruption, it re-subscribes to channels but misses all messages sent during the disconnection window. The UI shows no error — it simply shows an incomplete message history. For a human observing agent conversations, this means silently missing critical agent coordination that happened while the tab was backgrounded or the network was interrupted.

**Why it happens:**
WebSocket reconnection is implemented as a simple "reconnect and subscribe." The client re-registers for new messages but never requests the messages it missed. The server has no concept of "last seen message ID" per client.

**How to avoid:**
Implement cursor-based catch-up on reconnect. Each WebSocket client tracks a `lastSeenMessageId`. On reconnection, the client sends this ID and the server immediately pushes all messages with ID greater than that value before resuming live streaming. This is a one-time query on reconnect, not a polling mechanism. Because messages are persisted in SQLite, this is straightforward — `SELECT * FROM messages WHERE channel_id = ? AND id > ? ORDER BY id ASC`.

**Warning signs:**
- Human UI shows different message counts than what agents report in their tool calls
- Refreshing the UI reveals messages that the live view missed
- Agents refer to prior context that doesn't appear in the UI's history

**Phase to address:**
Phase 3 (WebSocket and UI Layer) — Design the reconnection protocol with cursor-based catch-up from day one, not as a follow-up fix.

---

### Pitfall 6: Over-Broad MCP Tool Schemas Confusing Agent Models

**What goes wrong:**
Agents call the wrong tool, provide wrong parameter combinations, or produce nonsensical tool calls when the MCP tool schema is too permissive, poorly described, or combines multiple concerns into one tool. For example, a single `channel_action` tool with a `type` field that can be `send_message | read_messages | update_document` causes models to guess at the type and frequently get it wrong.

**Why it happens:**
Developers design MCP tools thinking in REST API terms (one endpoint, action parameter). Agent models work better with narrow, unambiguous tools with distinct names. The model reads the tool name and description to decide which tool to call — vague or overlapping descriptions cause misrouting.

**How to avoid:**
One tool, one action. Separate `send_message`, `read_channel`, `create_document`, `update_document` into distinct tools. Write the description from the model's perspective: "Call this when you want to post a new message into a channel." Validate schemas against the actual MCP TypeScript SDK to ensure constraints (required fields, enums, bounds) are enforced. Test each tool in isolation with an actual Claude model call before integration testing.

**Warning signs:**
- Agents calling the wrong tool type repeatedly
- Schema validation errors appearing frequently in MCP server logs
- Agents defaulting to the first tool in the list regardless of intent

**Phase to address:**
Phase 2 (MCP Tool Design) — Tool naming and description quality must be validated with live model calls before declaring tools done.

---

### Pitfall 7: Message Delivery Confirmation Without Durability

**What goes wrong:**
The MCP `send_message` tool returns success to the agent before the message is written to the database. If the service crashes between the confirmation and the write, the message is permanently lost. The agent believes it communicated with its team; the message never arrives.

**Why it happens:**
Developers optimize for perceived responsiveness — returning a quick success to the agent and handling the write asynchronously. This is Slack's known historical mistake: confirming receipt at the channel server before database persistence, creating a loss window on crash.

**How to avoid:**
The MCP tool response must only be sent after a successful database write. For a local service, this synchronous pattern is acceptable and appropriate — there is no distributed system latency to optimize away. Use SQLite's WAL mode with `synchronous=NORMAL` for adequate durability without per-write fsync cost. The write queue (see SQLite pitfall) ensures ordering; the MCP handler awaits the queue completion before responding.

**Warning signs:**
- Messages that agents claim to have sent do not appear in the channel on service restart
- Service crash logs show write errors occurring after tool success responses
- Test scenarios where service is killed mid-operation result in agent/channel state divergence

**Phase to address:**
Phase 1 (Data Layer Foundation) — Write-first, respond-second must be an architectural invariant, not an optimization decision made later.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Polling instead of cursor-based catch-up on reconnect | Faster to implement | Clients miss messages on reconnect, hard to retrofit without breaking protocol | Never — build catch-up from the start |
| Global tenant context variable | Avoids threading tenant ID through calls | Silent cross-tenant data leakage in concurrent conditions | Never — always explicit parameter passing |
| Single monolithic MCP tool with action parameter | Fewer tools to maintain | Model confusion, wrong action selection, poor error messages | Never for agent-facing tools |
| No write serialization queue (rely on SQLite busy_timeout alone) | Less infrastructure | Intermittent SQLITE_BUSY errors that are hard to reproduce and debug | Only if agent count is strictly 1 (never in practice) |
| console.log() debugging in MCP server | Fast iteration during development | Protocol corruption crashes that look unrelated to the log call | Never ship — use stderr from day one |
| Optimistic message acknowledgement (respond before write) | Faster tool response time | Message loss on crash with no detection mechanism | Never for this domain |
| In-memory message state only (no persistence) | Dramatically simpler initial implementation | All agent context lost on any restart, agents cannot rebuild context | Acceptable for a prototype spike, never for the actual service |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP SDK stdio transport | Using `console.log()` for any debugging output | Configure all logging to `process.stderr` before writing any server code; use `console.error()` or pino with stderr destination |
| MCP SDK stdio transport | Assuming SSE transport is current | SSE is deprecated in the MCP spec; use Streamable HTTP for non-stdio transports |
| Claude Code hooks | Treating hooks as two-way — expecting hooks to send data back to Claude | Hooks communicate one-way via stdout/stderr and exit codes only; they cannot invoke tool calls or modify Claude's next action directly |
| Claude Code hooks | Capturing agent's own outgoing messages and re-injecting them | Always filter messages by sender ID in hook-captured context to prevent agents from processing their own outputs as new instructions |
| SQLite + better-sqlite3 | Using async patterns with better-sqlite3 (which is synchronous) | better-sqlite3 is intentionally synchronous; wrap in worker_threads if non-blocking I/O is required, or use the write queue pattern to serialize without blocking the event loop |
| SQLite WAL mode | Assuming WAL mode alone prevents all concurrency issues | WAL solves reader/writer contention; write/write contention still requires application-level serialization |
| WebSocket (ws library) | Not checking `socket.send()` return value for backpressure | Monitor `ws.bufferedAmount`; if the internal buffer fills, further sends will queue unboundedly in memory |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Broadcasting all messages to all WebSocket clients regardless of channel subscription | CPU spike and memory growth as message volume grows | Track per-socket subscriptions; only send to clients subscribed to the relevant channel | Noticeable with 3+ agents actively messaging in different channels simultaneously |
| Loading full channel message history on every channel read | Slow `read_channel` tool responses as history grows | Implement cursor/offset-based pagination from the first version; default page size of 50 messages | At 500+ messages per channel, which can happen within a single long agent session |
| Keeping long transactions open during hook processing | SQLITE_BUSY errors during any concurrent agent writes | Commit transactions before invoking any external code; hooks should operate outside transaction scope | Immediately visible when 2+ agents are simultaneously active |
| Unbounded in-memory event queue when agents produce messages faster than WebSocket clients consume | Memory growth until OOM or service kill | Implement bounded message queue with backpressure; monitor `ws.bufferedAmount` | When a UI client is backgrounded/throttled while agents are highly active |
| Full table scan for channel messages without index on `(channel_id, id)` | Slow reads that worsen as data accumulates | Add composite index on `(tenant_id, channel_id, id)` in the initial migration | Performance degrades visibly beyond ~10k total messages across all channels |

---

## Security Mistakes

> Note: This is a local developer tool with no authentication by design. Security concerns are scoped to local process isolation and data integrity, not network security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| MCP tool responses including raw SQL errors | Leaks schema information; confusing to agent models that may act on error content | Catch all DB errors at the service boundary; return structured error responses with codes, not raw exception messages |
| Unvalidated tenant ID from MCP tool parameters | A malformed or intentionally crafted tenant ID could escape the query scope or cause unexpected behavior | Validate tenant ID against a known allowlist of registered tenants before any query; reject unknown tenant IDs with a clear error |
| Hooks executing shell commands from message content | A malicious agent message could trigger hook-based shell execution | Never pass message content directly to shell commands in hooks; treat all message content as untrusted data |
| No rate limit on MCP tool calls | A looping agent can exhaust disk space and CPU until the machine is unresponsive | Implement per-agent rate limiting as a circuit breaker: max messages per minute, max tool calls per minute |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual distinction between agent messages and human messages | Humans lose track of who sent what; reduces observability value | Apply consistent visual differentiation — avatar, color band, or label — based on message sender type (agent vs human) |
| Flat message history with no thread context visible | Agent sub-conversations are interleaved and unreadable | Show thread reply count and last reply preview inline in the main channel view; open threads in a side panel |
| No indication when agents are "thinking" (between tool calls) | Humans cannot tell if agents are active or stuck | Show presence/typing indicators per agent based on active WebSocket connection and recent tool call activity |
| Document/canvas changes not reflected live in the UI | Humans reading a shared document see stale content | Documents should be updated via the same WebSocket event system as messages — any write triggers a real-time update to all subscribed clients |
| No message history on initial page load — wait for live events only | UI appears empty until agents send new messages | Always load the last N messages (50 default) on initial channel subscription before switching to live streaming |

---

## "Looks Done But Isn't" Checklist

- [ ] **MCP server tools:** Often missing schema validation — verify that required fields actually reject missing inputs, not just silently use undefined
- [ ] **Message persistence:** Often missing write-before-respond guarantee — verify service crash mid-operation does not produce a successful tool call with no persisted message
- [ ] **Tenant isolation:** Often missing concurrent-request testing — verify two simultaneous MCP calls from different tenants return isolated data
- [ ] **WebSocket reconnection:** Often missing gap recovery — verify that a client disconnecting for 30 seconds then reconnecting receives missed messages automatically
- [ ] **Thread replies:** Often missing thread message counts in channel list view — verify parent message shows reply count, not just reply detail page
- [ ] **Documents/canvases:** Often missing real-time sync — verify that one agent writing a document update causes immediate refresh in the human UI without page reload
- [ ] **Agent self-message filter:** Often missing in `read_channel` implementation — verify an agent does not receive its own messages as new incoming context
- [ ] **SQLite WAL mode:** Often enabled but not verified — run `PRAGMA journal_mode;` after startup and assert response is `wal`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| stdout pollution discovered after MCP server shipped | LOW | Grep all MCP server files for `console.log`, replace with `console.error`, re-test with MCP inspector tool |
| Tenant isolation leak discovered in production data | HIGH | Audit all messages in DB for misassigned tenant_id; add mandatory tenant_id checks to every query; write regression test covering the concurrency scenario |
| Agent self-message loop has filled database with junk | MEDIUM | Stop the looping agent; delete loop-generated messages from DB (identifiable by timestamp clustering and message similarity); add self-message filter and rate limiter before re-enabling |
| Missing reconnection catch-up requires protocol change | MEDIUM | Add `lastSeenMessageId` field to WebSocket subscription message; server-side add catch-up query; UI client updated to send cursor on reconnect — backward compatible if server handles missing cursor gracefully |
| SQLite write queue not implemented and SQLITE_BUSY errors are in production | MEDIUM | Wrap the DB access layer with an async-queue (e.g. `p-queue` with concurrency 1); no schema changes required, purely an application-level fix |
| MCP tool schema too broad causing agent misuse | LOW | Rename and split tools; update MCP server registration; agents pick up new tools on next session start (no persistent state to migrate) |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| MCP stdout pollution | Phase 1 — MCP Server Foundation | MCP inspector shows clean JSON-RPC stream with zero stdout noise; `console.log` lint rule passes |
| SQLite write contention | Phase 1 — Data Layer Foundation | Concurrent write load test (10 simultaneous inserts) produces zero SQLITE_BUSY errors |
| Tenant isolation leakage | Phase 1 — Multi-Tenant Data Model | Integration test: 2 concurrent MCP calls from different tenants return exclusively their own data |
| Write-before-respond durability | Phase 1 — Data Layer Foundation | Kill service mid-write in test; verify no orphaned successful tool responses with unwritten messages |
| Agent self-message loop | Phase 2 — MCP Tool Design | Test: agent calls `read_channel` after `send_message`; its own message is not present in the response |
| Over-broad tool schemas | Phase 2 — MCP Tool Design | Live model test: Claude correctly routes to the intended tool 10/10 times without disambiguation |
| WebSocket reconnect gap | Phase 3 — WebSocket and UI Layer | Test: connect client, disconnect 30s, reconnect; assert all messages from gap period are delivered |
| Unbounded backpressure | Phase 3 — WebSocket and UI Layer | Load test: 100 messages/second while client is throttled; server memory stays bounded |
| Document live sync | Phase 4 — Documents/Canvases | Test: agent writes document; human UI updates within 500ms without page reload |

---

## Sources

- [Implementing MCP: Tips, Tricks and Pitfalls — Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)
- [MCP STDIO Transport: stdout/stderr separation — MCP Framework Docs](https://mcp-framework.com/docs/Transports/stdio-transport/)
- [SQLite Concurrent Writes and Database Locked Errors](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [SQLite Write-Ahead Logging — Official SQLite Docs](https://sqlite.org/wal.html)
- [Backpressure in WebSocket Streams — Skyline Codes](https://skylinecodes.substack.com/p/backpressure-in-websocket-streams)
- [Node.js WebSocket Backpressure: Flow-Control Patterns — Medium](https://medium.com/@hadiyolworld007/node-js-websockets-backpressure-flow-control-patterns-for-stable-real-time-apps-27ab522a9e69)
- [Multi-Tenant Leakage: When Row-Level Security Fails — Medium](https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c)
- [Tenant Data Isolation: Patterns and Anti-Patterns — Propelius](https://propelius.ai/blogs/tenant-data-isolation-patterns-and-anti-patterns)
- [Six Fatal Flaws of the Model Context Protocol — ScalifiAI](https://www.scalifiai.com/blog/model-context-protocol-flaws-2025)
- [Agentic Resource Exhaustion: The Infinite Loop Attack — Medium](https://medium.com/@instatunnel/agentic-resource-exhaustion-the-infinite-loop-attack-of-the-ai-era-76a3f58c62e3)
- [Designing Agentic Loops — Simon Willison](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)
- [How Slack Built Shared Channels — Slack Engineering](https://slack.engineering/how-slack-built-shared-channels/)
- [How to Handle WebSocket Reconnection Logic — OneUptime](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view)
- [WebSocket Memory Leak Issues — OneUptime](https://oneuptime.com/blog/post/2026-01-24-websocket-memory-leak-issues/view)
- [Claude Code Hooks Guide — Anthropic](https://code.claude.com/docs/en/hooks-guide)

---
*Pitfalls research for: Local multi-tenant agent messaging service (AgentChat)*
*Researched: 2026-03-07*
