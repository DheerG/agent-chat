---
phase: 07-channel-and-tenant-archiving
plan: 02
subsystem: client
tags: [react, hooks, css, archiving, sidebar]

requires:
  - phase: 07-channel-and-tenant-archiving/07-01
    provides: Archive/restore HTTP API endpoints
provides:
  - Client API functions for archive/restore operations
  - useTenants and useChannels hooks with refreshKey-based re-fetching
  - Sidebar archive buttons on channel items and tenant headers
  - Collapsible Archived section showing archived tenants and channels
  - App.tsx integration with channel deselection on archive
affects:
  - packages/client/src/hooks/useTenants.ts (signature changed to accept refreshKey)
  - packages/client/src/hooks/useChannels.ts (signature changed to accept refreshKey)
  - packages/client/src/components/Sidebar.tsx (SidebarProps expanded with archive/restore callbacks)
  - packages/client/src/App.tsx (new archive/restore handlers and refreshKey state)

tech-stack:
  added: []
  patterns: [refreshKey pattern for triggering hook re-fetches, hover-reveal archive buttons]

key-files:
  created: []
  modified:
    - packages/client/src/lib/api.ts
    - packages/client/src/hooks/useTenants.ts
    - packages/client/src/hooks/useChannels.ts
    - packages/client/src/components/Sidebar.tsx
    - packages/client/src/components/Sidebar.css
    - packages/client/src/App.tsx
    - packages/client/src/__tests__/Sidebar.test.tsx

key-decisions:
  - "Used refreshKey prop pattern instead of refetch callback pattern for simplicity — App controls refresh via counter state"
  - "ArchivedSection defined inline in Sidebar.tsx rather than a separate file"
  - "Archive buttons use unicode cross character with opacity 0 by default, revealed on hover"
  - "Archived section collapsed by default, fetches data only when expanded"

patterns-established:
  - "refreshKey counter pattern for triggering useEffect re-fetches across multiple hooks"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

duration: 10min
completed: 2026-03-07
---

# Plan 07-02: Frontend Archive/Restore UI

**Client API functions, sidebar archive buttons, collapsible archived section, and App integration**

## Performance

- **Duration:** 10 min
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- 6 new API functions in api.ts: archiveChannel, restoreChannel, archiveTenant, restoreTenant, fetchArchivedTenants, fetchArchivedChannels
- useTenants and useChannels hooks accept optional refreshKey parameter for re-fetching
- Archive buttons (hover-reveal) on channel items and tenant headers in sidebar
- Collapsible "Archived" section at bottom of sidebar (collapsed by default)
- ArchivedSection fetches and displays archived tenants and individually-archived channels
- Restore buttons in archived section for both tenants and channels
- App.tsx handlers for archive/restore with channel deselection when archiving active channel
- 7 new Sidebar tests covering archive buttons, callbacks, and restore interactions
- 53 total client tests passing with zero regressions

## Files Modified
- `packages/client/src/lib/api.ts` - Added 6 archive/restore API functions
- `packages/client/src/hooks/useTenants.ts` - Added refreshKey parameter to useEffect dependency
- `packages/client/src/hooks/useChannels.ts` - Added refreshKey parameter to useEffect dependency
- `packages/client/src/components/Sidebar.tsx` - Expanded SidebarProps, added archive buttons to TenantGroup, added ArchivedSection component
- `packages/client/src/components/Sidebar.css` - Added styles for archive buttons, archived section, restore buttons
- `packages/client/src/App.tsx` - Added archive/restore handlers with deselection logic, refreshKey state
- `packages/client/src/__tests__/Sidebar.test.tsx` - Added 7 tests for archive/restore UI

## Issues Encountered
None.

## Deviations from Plan
- Used refreshKey prop instead of refetch callback pattern. The plan suggested both approaches; refreshKey is simpler since all re-fetching is driven from App state.

---
*Phase: 07-channel-and-tenant-archiving*
*Completed: 2026-03-07*
