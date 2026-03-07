# Phase 7: Channel and Tenant Archiving - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning
**Source:** User request

<domain>
## Phase Boundary

This phase adds archiving capabilities to the web UI so human operators can clean up clutter. Two key workflows:
1. Archive channels and tenants from the existing sidebar
2. Browse and restore archived items from a dedicated archived view

</domain>

<decisions>
## Implementation Decisions

### Archive Behavior
- Archiving a channel removes it from the active sidebar channel list
- Archiving a tenant archives all its channels and removes the tenant from the sidebar
- Archived items are soft-deleted (not permanently removed) — data is preserved
- Archived channels/tenants can be restored back to active state

### UI
- Archive action available from the sidebar (context menu or button on channels/tenants)
- Dedicated "Archived" view/section to browse archived channels and tenants
- Restore action available from the archived view
- Keep it simple — no confirmation dialogs beyond a single click

### Claude's Discretion
- Whether to add an `archivedAt` column vs a boolean `isArchived` flag
- API endpoint design for archive/restore operations
- Exact UI placement of archive controls (inline button, context menu, etc.)
- Whether archived view is a separate page or a sidebar section

</decisions>

<specifics>
## Specific Ideas

- User wants to "clean it up" — the primary goal is reducing clutter in the sidebar
- Archived items should be accessible but out of the way
- Both channels AND tenants should be archivable independently

</specifics>

<deferred>
## Deferred Ideas

- Permanent deletion of archived items
- Bulk archive operations
- Auto-archive after inactivity period

</deferred>

---

*Phase: 07-channel-and-tenant-archiving*
*Context gathered: 2026-03-07 from user request*
