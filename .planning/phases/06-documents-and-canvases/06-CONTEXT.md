# Phase 6: Documents and Canvases - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Persistent shared documents pinned to channels that agents can create and update via MCP tools, and humans can view alongside the message feed in the web UI. Documents survive service restarts and update live via WebSocket. No collaborative editing (OT/CRDT), no cross-channel document references (v2 DOC-05), no version history with diff view (v2 DOC-06).

Requirements: DOC-01, DOC-02, DOC-03, DOC-04

</domain>

<decisions>
## Implementation Decisions

### Data Model
- New `documents` table in SQLite schema: id (ULID), channel_id, tenant_id (denormalized), title, content (TEXT — stores raw content), content_type (text|markdown|json), created_by_id, created_by_name, created_by_type (agent|human), created_at, updated_at
- Documents are mutable (unlike messages which are append-only) — UPDATE is allowed on title, content, updated_at
- Each document belongs to exactly one channel (pinned) — the channel_id is set at creation and cannot change
- Tenant isolation enforced identically to messages: tenant_id is a required parameter on all queries
- Composite index on (tenant_id, channel_id) for efficient per-channel document listing
- No size limit enforced at the schema level — content is TEXT (SQLite handles arbitrary size)

### MCP Tools (Agent Interface)
- `create_document` tool: Creates a document pinned to a channel. Args: channel_id, title, content, content_type (optional, defaults to "text"). Returns: document id, title, channel_id, created_at
- `update_document` tool: Overwrites an existing document's title and/or content. Args: document_id, title (optional), content (optional). Returns: updated document. Requires at least one of title or content
- `read_document` tool: Reads a single document by ID. Args: document_id. Returns: full document including content
- `list_documents` tool: Lists all documents pinned to a channel (metadata only, no content). Args: channel_id. Returns: array of {id, title, content_type, created_by_name, updated_at}
- All tools are tenant-scoped (tenantId resolved from MCP config, same pattern as existing tools)
- Agent identity (created_by_id, created_by_name) comes from McpConfig, same as send_message

### REST API (HTTP Interface)
- `GET /api/tenants/:tenantId/channels/:channelId/documents` — list documents for a channel (metadata only)
- `GET /api/tenants/:tenantId/channels/:channelId/documents/:documentId` — get single document with content
- `POST /api/tenants/:tenantId/channels/:channelId/documents` — create document (for human authors via UI)
- `PUT /api/tenants/:tenantId/channels/:channelId/documents/:documentId` — update document content
- Same validation pattern as message routes (zod schemas, tenant/channel existence checks)
- Routes mounted in app.ts following existing pattern

### WebSocket Live Updates
- New event types on the WebSocket: `document:created` and `document:updated`
- Events are broadcast to all clients subscribed to the channel (same pattern as `message:created`)
- DocumentService emits events via the shared EventEmitter, WebSocketHub listens and broadcasts
- Client receives these events and updates the document list/content in real-time without page refresh

### UI Integration (Human View)
- Documents panel as a collapsible section in the channel view — positioned above or beside the message feed
- When a channel is selected, documents for that channel are fetched via REST and displayed as a list of clickable titles
- Clicking a document title expands it inline to show content (or opens in a side panel similar to ThreadPanel)
- Document content rendered as plain text; markdown content rendered with basic formatting (headings, bold, code blocks)
- Documents panel shows: title, content type badge, author name, last updated timestamp
- Empty state when no documents: "No documents in this channel"
- Real-time updates via WebSocket — new documents appear and content changes reflect immediately

### Claude's Discretion
- Exact visual design of the documents panel (colors, spacing, typography)
- Whether documents panel is a sidebar section, tab, or inline accordion
- Markdown rendering library choice (if any — could use a lightweight one or CSS-only)
- Whether to show a document creation form in the UI or only support creation via MCP/API
- Loading and error states for document fetching
- Animation/transition for document panel open/close
- Document list sort order (by updated_at desc is the sensible default)

</decisions>

<specifics>
## Specific Ideas

- Follow the same service/query/route pattern established in Phases 1-2 — DocumentService with query layer, Hono routes, zod validation
- MCP tool handlers follow the exact pattern of send-message.ts / read-channel.ts — handler function in tools/ directory, registered in index.ts
- Documents are "pinned artifacts" — think of them as shared whiteboards or spec documents that agents collaborate on within a channel, not as file uploads
- Keep it simple: a document is title + content + metadata. No folders, no tags, no complex organization (that would be v2)
- The existing WebSocket wire protocol can be extended with new server message types without breaking existing clients

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MessageService` pattern (packages/server/src/services/MessageService.ts): DocumentService will follow the same constructor(queries, emitter) pattern with event emission for WebSocket broadcast
- `createMessageQueries` pattern (packages/server/src/db/queries/messages.ts): DocumentQueries will follow the same DbInstance+WriteQueue dependency injection
- MCP tool handler pattern (packages/mcp/src/tools/send-message.ts): Document MCP tools will follow the same (services, config, tenantId, args) signature
- HTTP route pattern (packages/server/src/http/routes/messages.ts): Document routes will follow the same Hono router with zod validation
- `@agent-chat/shared` types: New Document interface will be added alongside Message, Channel, Tenant
- Drizzle schema (packages/shared/src/schema.ts): New documents table definition follows the same pattern as messages table
- WebSocketHub (packages/server/src/ws/): Listens for EventEmitter events — will add `document:created` and `document:updated` listeners
- App.tsx three-panel layout: Documents panel integrates into the existing channel view structure

### Established Patterns
- All IDs are ULIDs generated server-side
- Tenant isolation via mandatory tenant_id parameter on all query functions
- Write serialization through WriteQueue for INSERT/UPDATE operations
- EventEmitter decoupling between services and WebSocketHub
- Zod validation on all HTTP request bodies and query params
- JSON error shape: `{ error: string, code: string }`
- lib.ts re-exports for MCP package consumption
- CSS Modules / plain CSS for client styling (no Tailwind)

### Integration Points
- Schema: Add `documents` table to packages/shared/src/schema.ts
- Types: Add `Document` interface to packages/shared/src/types.ts
- Services: Add DocumentService to packages/server/src/services/, register in createServices() and Services interface
- Queries: Add packages/server/src/db/queries/documents.ts
- Routes: Add packages/server/src/http/routes/documents.ts, mount in app.ts
- MCP: Add tool handlers in packages/mcp/src/tools/, register in packages/mcp/src/index.ts
- WebSocket: Extend WebSocketHub to broadcast document events
- Client: Add useDocuments hook, DocumentPanel component, integrate into App.tsx
- lib.ts: Export DocumentService and related types

</code_context>

<deferred>
## Deferred Ideas

- Cross-channel document references within same tenant — v2 feature (DOC-05)
- Document version history with diff view — v2 feature (DOC-06)
- Document search / full-text search — v2 feature, would use FTS5
- Document templates — future enhancement
- File attachments / binary content — out of scope, documents are text-based
- Document access control / permissions — out of scope (local tool, implicit trust)
- Markdown editor in the UI — future enhancement, plain textarea is sufficient for v1

</deferred>

---

*Phase: 06-documents-and-canvases*
*Context gathered: 2026-03-07*
