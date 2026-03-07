# Phase 11: Team Inbox Ingestion — Research

**Completed:** 2026-03-07
**Researcher:** Direct (inline)

## Codebase Analysis

### Existing Architecture

The server follows a layered architecture:
1. **DB Layer** (`packages/server/src/db/`) — SQLite via better-sqlite3 + Drizzle ORM, WAL mode, WriteQueue for serialization
2. **Service Layer** (`packages/server/src/services/`) — TenantService, ChannelService, MessageService, PresenceService, DocumentService
3. **HTTP Layer** (`packages/server/src/http/`) — Hono REST API with route modules
4. **WebSocket Layer** (`packages/server/src/ws/`) — WebSocketHub listens to EventEmitter for real-time delivery
5. **Hook Layer** (`packages/server/src/hooks/`) — Claude Code hook event handlers

### Key Integration Points

**EventEmitter pattern (Phase 4):**
- `MessageService.send()` emits `message:created` on the shared EventEmitter
- `WebSocketHub` listens for `message:created` and broadcasts to subscribed WebSocket clients
- This is the exact pattern the file watcher should use — call `MessageService.send()` and the rest happens automatically

**Tenant creation (TenantService):**
- `upsertByCodebasePath(name, codebasePath)` — creates or returns existing tenant
- codebasePath is used as the unique key
- For team ingestion, we need a parallel: `upsertByTeamName()` or use a synthetic codebasePath

**Channel creation (ChannelService):**
- `create(tenantId, { name, sessionId?, type? })` — creates channel with ULID
- Channel types: 'session' | 'manual' — team channels should be 'manual' or we could add 'team'
- Channels have `archivedAt` for archiving support

**Message creation (MessageService):**
- `send(tenantId, data)` — inserts message, emits event for WebSocket
- SendMessageData: `{ channelId, senderId, senderName, senderType, content, messageType?, parentMessageId?, metadata? }`
- senderType options: 'agent' | 'human' | 'system' | 'hook'

### Server Entry Point (index.ts)

The server creates:
1. `createDb()` — database instance
2. `WriteQueue` — write serialization
3. `EventEmitter` — event bus
4. `createServices(instance, queue, emitter)` — all services
5. `createApp(services)` — HTTP routes
6. `WebSocketHub(services, emitter)` — WebSocket handler
7. HTTP server via `serve()`

The file watcher needs access to `services` (specifically `tenants`, `channels`, `messages`) and should be started alongside the HTTP server. It integrates at the same level as WebSocketHub.

### Real Team Inbox Data Format

From live data at `~/.claude/teams/eval-issue-1518/`:

**config.json:**
```json
{
  "name": "eval-issue-1518",
  "description": "Expert team for processing AI evaluation issue #1518...",
  "createdAt": 1772881052021,
  "leadAgentId": "team-lead@eval-issue-1518",
  "leadSessionId": "a2128e64-4287-483d-b11e-f3fbca09885b",
  "members": [
    {
      "agentId": "team-lead@eval-issue-1518",
      "name": "team-lead",
      "agentType": "team-lead",
      "model": "claude-opus-4-6",
      "joinedAt": 1772881052021,
      "cwd": "/Users/dheer/code/skipup"
    },
    {
      "agentId": "principal-engineer@eval-issue-1518",
      "name": "principal-engineer",
      "agentType": "general-purpose",
      "model": "opus",
      "color": "blue",
      ...
    }
  ]
}
```

**Inbox files** (`inboxes/{agent-name}.json`):
```json
[
  {
    "from": "principal-engineer",
    "text": "I've completed my root cause analysis...",
    "summary": "Root cause analysis of SendGrid CTA tracking issue",
    "timestamp": "2026-03-07T11:00:43.104Z",
    "color": "blue",
    "read": true
  },
  {
    "from": "email-specialist",
    "text": "{\"type\":\"idle_notification\",\"from\":\"email-specialist\",...}",
    "timestamp": "2026-03-07T11:01:07.678Z",
    "color": "yellow",
    "read": true
  }
]
```

### Key Observations from Real Data:
1. Inbox files are JSON arrays — entire file is rewritten on each update (not appended)
2. Messages have ISO 8601 timestamps with millisecond precision
3. The `from` field is the agent's name (e.g., "principal-engineer"), not the agentId
4. Structured messages (idle_notification, shutdown_request) have their JSON stringified in the `text` field
5. The `read` field indicates whether the receiving agent has read the message
6. `color` field varies per agent (blue, yellow, etc.)
7. `summary` is optional — some messages don't have it

### File Watching Approaches

**Node.js `fs.watch`:**
- Built-in, no dependencies
- Platform-dependent behavior (macOS uses FSEvents, Linux uses inotify)
- Recursive watching supported on macOS (FSEvents) and Windows
- Can miss events or fire duplicates
- Does not provide file content — just notification of change

**`chokidar` npm package:**
- Most popular file watcher (~45M weekly downloads)
- Cross-platform consistent behavior
- Handles edge cases (atomic writes, editor temp files, etc.)
- Supports glob patterns, recursive watching
- Provides 'add', 'change', 'unlink' events with file paths
- Stabilized events via `awaitWriteFinish` option for files that are being written

**Recommendation: Use `fs.watch` with manual debouncing.** The team inbox files are simple JSON files that get rewritten entirely. We don't need chokidar's complexity. `fs.watch` on macOS (the dev platform) uses FSEvents which is reliable. Add a small debounce (100ms) to handle rapid file rewrites.

### Deduplication Strategy

Messages appear in multiple inbox files when broadcast. The deduplication key is `(from, timestamp, text)`:
- `from` — sender agent name
- `timestamp` — ISO 8601 with millisecond precision (effectively unique per message)
- `text` — full message content

Implementation: Use a `Set<string>` with a composite key like `${from}|${timestamp}|${hash(text)}` to track already-ingested messages. Hash the text content to avoid storing full message content in memory.

### Tenant/Channel Mapping

For each team discovered:
1. **Tenant:** Create with `name = team-name`, `codebasePath = ~/.claude/teams/{team-name}` (synthetic but unique)
2. **Channel:** Create single channel per team with `name = team-name`, `type = 'manual'`
3. **Messages:** Each inbox message maps to a MessageService.send() call

### Error Handling

- **File being written (partial JSON):** Wrap JSON.parse in try/catch, retry on next change event
- **File deleted (team teardown):** Log and stop watching that team
- **Permission errors:** Log and skip
- **Concurrent writes:** Debounce handles this — wait for writes to settle

## Validation Architecture

### Test Strategy

1. **Unit tests for TeamInboxWatcher:**
   - Mock fs.watch to simulate file events
   - Verify message extraction from inbox JSON
   - Verify deduplication (same message in multiple inboxes)
   - Verify tenant/channel auto-creation
   - Verify structured message parsing (idle_notification, etc.)

2. **Integration tests:**
   - Write real JSON files to a temp directory
   - Verify messages appear in MessageService
   - Verify EventEmitter fires for WebSocket delivery

3. **Edge case tests:**
   - Invalid JSON in inbox file
   - Empty inbox file
   - File deletion during watching
   - New team directory appearing
   - Rapid successive file changes

### Coverage Targets
- TeamInboxWatcher class: 90%+ line coverage
- Message extraction/dedup: 100% branch coverage
- Error handling paths: all tested
