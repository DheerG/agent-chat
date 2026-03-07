---
phase: 06-documents-and-canvases
plan: 02
subsystem: api
tags: [hono, zod, mcp, websocket, rest, documents]

requires:
  - phase: 06-documents-and-canvases/06-01
    provides: DocumentService, document queries, documents table schema
provides:
  - REST API endpoints for document CRUD (GET list, GET by ID, POST create, PUT update)
  - 4 MCP tool handlers (create_document, read_document, update_document, list_documents)
  - WebSocket broadcast for document:created and document:updated events
affects: [06-documents-and-canvases/06-03, client, ui]

tech-stack:
  added: []
  patterns: [MCP tool handler pattern for documents, REST route pattern for documents, WebSocket document event broadcast]

key-files:
  created:
    - packages/server/src/http/routes/documents.ts
    - packages/server/src/http/__tests__/documents.test.ts
    - packages/mcp/src/tools/create-document.ts
    - packages/mcp/src/tools/read-document.ts
    - packages/mcp/src/tools/update-document.ts
    - packages/mcp/src/tools/list-documents.ts
    - packages/mcp/src/__tests__/document-tools.test.ts
  modified:
    - packages/server/src/http/app.ts
    - packages/server/src/ws/WebSocketHub.ts
    - packages/mcp/src/index.ts

key-decisions:
  - "MCP tools use snake_case args (channel_id, document_id) matching existing MCP conventions"
  - "list_documents returns metadata only (no content field) to keep payloads small"
  - "WebSocket document events reuse the channel subscription model — clients subscribed to a channel get document events for that channel"

patterns-established:
  - "Document REST routes: nested under /api/tenants/:tenantId/channels/:channelId/documents"
  - "MCP document tools: agent identity injected from config (agentId, agentName)"
  - "WebSocket document broadcast: broadcastDocumentEvent follows same tenant isolation pattern as broadcastToChannel"

requirements-completed: [DOC-01, DOC-02]

duration: 15min
completed: 2026-03-07
---

# Plan 06-02: REST API, MCP Tools, and WebSocket Broadcast for Documents

**Document CRUD via REST (4 endpoints with Zod validation), 4 MCP tools with agent identity, and WebSocket broadcast for real-time document events**

## Performance

- **Duration:** 15 min
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 3

## Accomplishments
- REST API with GET list, GET by ID, POST create, PUT update endpoints with Zod validation and tenant/channel existence checks
- 4 MCP tool handlers (create_document, read_document, update_document, list_documents) registered in MCP server with agent identity from config
- WebSocket broadcast for document:created and document:updated events to channel subscribers with tenant isolation
- 11 HTTP tests + 9 MCP tests passing, 98 server tests total, 24 MCP tests total

## Task Commits

1. **Task 1: REST API routes for documents** - `78ad636` (feat)
2. **Task 2: MCP document tool handlers** - `78ad636` (feat)
3. **Task 3: WebSocket document event broadcast** - `78ad636` (feat)

All 3 tasks committed together as a single plan commit.

## Files Created/Modified
- `packages/server/src/http/routes/documents.ts` - REST endpoints: GET list, GET by ID, POST create, PUT update with Zod validation
- `packages/server/src/http/__tests__/documents.test.ts` - 11 HTTP tests covering all endpoints and error cases
- `packages/server/src/http/app.ts` - Mounted documentRoutes at channel documents path
- `packages/server/src/ws/WebSocketHub.ts` - Added document:created and document:updated event listeners and broadcastDocumentEvent method
- `packages/mcp/src/tools/create-document.ts` - MCP handler using config.agentId/agentName for author identity
- `packages/mcp/src/tools/read-document.ts` - MCP handler returning full document or null
- `packages/mcp/src/tools/update-document.ts` - MCP handler for title/content updates
- `packages/mcp/src/tools/list-documents.ts` - MCP handler returning metadata array (no content)
- `packages/mcp/src/index.ts` - Registered 4 new MCP tools with Zod schemas
- `packages/mcp/src/__tests__/document-tools.test.ts` - 9 MCP tool tests

## Decisions Made
- Followed plan exactly for REST routes and MCP tools
- MCP list_documents intentionally excludes content field (metadata only) to keep payloads small
- WebSocket document events reuse channel subscription model rather than requiring separate document subscriptions

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Server package needed rebuild (`pnpm build` in packages/server) before MCP tests could resolve DocumentService — same pattern as shared package rebuild in Plan 06-01

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All API layers complete (data, REST, MCP, WebSocket)
- Ready for Plan 06-03: client-side DocumentPanel component with useDocuments hook and WebSocket integration

---
*Phase: 06-documents-and-canvases*
*Completed: 2026-03-07*
