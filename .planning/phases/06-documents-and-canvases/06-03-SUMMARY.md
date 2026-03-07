---
phase: 06-documents-and-canvases
plan: 03
subsystem: ui
tags: [react, hooks, websocket, css, documents, testing-library]

requires:
  - phase: 06-documents-and-canvases/06-01
    provides: Document type, DocumentService
  - phase: 06-documents-and-canvases/06-02
    provides: REST API endpoints, WebSocket document events
provides:
  - DocumentPanel component with expandable document content view
  - useDocuments hook for fetching and managing document state
  - WebSocket integration for real-time document_created and document_updated events
  - Document API client functions (fetchDocuments, fetchDocument)
affects: []

tech-stack:
  added: []
  patterns: [useDocuments hook pattern, DocumentPanel component pattern, WebSocket document event handling]

key-files:
  created:
    - packages/client/src/components/DocumentPanel.tsx
    - packages/client/src/components/DocumentPanel.css
    - packages/client/src/hooks/useDocuments.ts
    - packages/client/src/__tests__/DocumentPanel.test.tsx
  modified:
    - packages/client/src/lib/api.ts
    - packages/client/src/hooks/useWebSocket.ts
    - packages/client/src/App.tsx

key-decisions:
  - "DocumentPanel placed below MessageFeed in the channel view layout"
  - "Documents expand/collapse on title click with content shown in a pre block"
  - "useWebSocket extended with optional onDocumentCreated and onDocumentUpdated parameters"

patterns-established:
  - "Document hooks follow same pattern as useMessages (fetch on channel change, mutation callbacks)"
  - "WebSocket event extension via additional optional callback parameters"

requirements-completed: [DOC-02, DOC-03]

duration: 8min
completed: 2026-03-07
---

# Plan 06-03: DocumentPanel UI with Real-Time WebSocket Integration

**DocumentPanel component with expandable content view, REST fetch hook, and live WebSocket document updates**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 3

## Accomplishments
- DocumentPanel component rendering document list with titles, content type badges, author names, and timestamps
- Expandable document content on click with collapse toggle
- useDocuments hook fetching documents via REST API with loading/error states
- WebSocket hook extended for document_created and document_updated real-time events
- Integrated into App.tsx channel view alongside MessageFeed
- 10 new component tests, 46 total client tests passing

## Task Commits

1. **Task 1: Document API functions and useDocuments hook** - `9989b1c` (feat)
2. **Task 2: WebSocket extension, DocumentPanel, and App integration** - `9989b1c` (feat)

All tasks committed together as a single plan commit.

## Files Created/Modified
- `packages/client/src/components/DocumentPanel.tsx` - Document list with expand/collapse, badges, metadata
- `packages/client/src/components/DocumentPanel.css` - Styles for document panel, items, badges, content view
- `packages/client/src/hooks/useDocuments.ts` - Hook for fetching documents with addDocument/updateDocument callbacks
- `packages/client/src/__tests__/DocumentPanel.test.tsx` - 10 tests covering all states and interactions
- `packages/client/src/lib/api.ts` - Added fetchDocuments and fetchDocument API functions
- `packages/client/src/hooks/useWebSocket.ts` - Extended with onDocumentCreated and onDocumentUpdated handlers
- `packages/client/src/App.tsx` - Integrated DocumentPanel, useDocuments, and WebSocket document handlers

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 plans complete for Phase 6
- Full document lifecycle working: data layer, REST API, MCP tools, WebSocket broadcast, and web UI
- Ready for phase verification

---
*Phase: 06-documents-and-canvases*
*Completed: 2026-03-07*
