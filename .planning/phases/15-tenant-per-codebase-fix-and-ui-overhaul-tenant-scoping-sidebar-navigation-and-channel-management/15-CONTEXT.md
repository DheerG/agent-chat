# Phase 15: Tenant-per-codebase fix and UI overhaul - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the tenant identity bug where TeamInboxWatcher creates tenants keyed by team name/path instead of actual codebase path. Overhaul the web UI to support tenant-scoped views with a tenant switcher, improved sidebar navigation, better channel management, and significantly improved overall visual design. This phase does NOT add new features — it fixes a data model bug and dramatically improves the existing UI.

</domain>

<decisions>
## Implementation Decisions

### Tenant Identity Fix
- TeamInboxWatcher currently calls `upsertByCodebasePath(teamName, teamPath)` where `teamPath` is `join(teamsDir, teamName)` — the team directory path, NOT the actual codebase path where agents work
- The fix: extract the actual codebase path from team config's `members[].cwd` field (all members in a team share the same codebase, so take the first member's `cwd` as the canonical codebase path)
- If no member has a `cwd` field, fall back to the team directory path (backwards compatibility)
- When multiple teams work in the same codebase, they should map to the SAME tenant but create separate channels within it
- The tenant `name` field should use the codebase directory name (basename of codebasePath) for clarity, not the team name
- Each team still gets its own channel within the tenant, named after the team

### Tenant-Scoped Sidebar
- Replace the current "all tenants expanded" sidebar with a tenant-scoped view
- Top of sidebar: tenant selector/switcher dropdown showing tenant name + channel count
- Below: flat list of channels for the selected tenant only (no collapsible tenant groups needed when viewing one tenant at a time)
- Auto-select the first tenant on load, or restore last-selected tenant from localStorage
- Sidebar width remains 260px but content gets better use of space

### Channel List Within Tenant
- Channels shown as a clean flat list with hash prefix
- Active channel highlighted with distinct background
- Channel names truncated with ellipsis for long names
- Archive button appears on hover (existing pattern, keep it)
- Add a small channel header showing the selected tenant name and codebase path as subtitle

### Overall UI Visual Improvements
- Add a proper header bar to the main content area showing current channel name and tenant context
- Improve message spacing — current 8px padding is too tight, increase to 12px with better grouping of consecutive messages from same sender
- Add message grouping: consecutive messages from the same sender within 5 minutes collapse avatars (show avatar only on first message in group)
- Improve the empty state placeholder — add an icon or illustration text and better messaging
- Better visual separation between message feed and compose input area
- Improve compose input: add a subtle border-top separator, slightly taller input area
- Human message bubble styling: keep the blue-tinted background but add slightly more padding
- Improve the "new messages" indicator pill — make it slightly larger and more prominent
- Add subtle date separators between messages from different days

### Message Header Bar
- Add a header bar between sidebar and message feed showing: channel name, tenant name (smaller), and member count or channel metadata
- This replaces the current approach where there's no context about what channel you're viewing
- Header should have a clean, minimal design consistent with the sidebar dark theme transitioning to white content area

### Claude's Discretion
- Exact colors for the tenant switcher dropdown
- Typography sizing details beyond the general direction
- Transition animations timing
- Date separator exact format (e.g., "Today", "Yesterday", "March 8, 2026")
- Whether to add subtle hover effects on messages
- Exact dropdown behavior (click vs hover for tenant switcher)
- DocumentPanel visual improvements (keep functional, polish visually)
- ThreadPanel visual improvements (keep functional, polish visually)

</decisions>

<specifics>
## Specific Ideas

- The tenant switcher should feel like Slack's workspace switcher — clean dropdown at the top of the sidebar
- Message grouping like Discord/Slack — consecutive messages from the same sender don't repeat the avatar and name
- The overall feel should be "polished local dev tool" — not over-designed, but professional and clean
- The header bar above messages gives crucial context about what you're looking at (currently missing)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConfirmDialog` component: Reuse for any new confirmation dialogs
- `EventCard` / `TeamEventCard`: Already handle structured message rendering
- `MessageContent`: Handles markdown rendering, code blocks — reuse as-is
- CSS custom properties (design tokens) on `:root` in App.css: All new colors should be added here
- `usePresence`, `useMessages`, `useDocuments`, `useWebSocket` hooks: All functional, extend as needed

### Established Patterns
- CSS Modules pattern: Each component has its own `.css` file imported directly
- State lifted to App.tsx: selectedTenantId, selectedChannelId, messages state managed at top level
- refreshKey pattern: Used to trigger data re-fetches after mutations (archive/restore)
- API layer in `lib/api.ts`: All API calls centralized here with fetchJson helper
- WebSocket subscribe/unsubscribe per channel: Already working, extend for tenant-level events

### Integration Points
- `TenantService.upsertByCodebasePath(name, codebasePath)`: This is the function to fix — codebasePath arg must be the actual codebase path
- `TeamInboxWatcher.processTeam()`: Where the tenant creation happens — needs to extract cwd from team config
- `Sidebar` component: Major refactor target — replace TenantGroup pattern with tenant switcher + flat channel list
- `App.tsx`: Needs to add header bar component between sidebar and main content
- `useTenants` hook: May need to support "selected tenant" state persistence

</code_context>

<deferred>
## Deferred Ideas

- Search/filtering channels within a tenant — future phase
- Notification badges/unread counts on channels — future phase
- Keyboard shortcuts for tenant/channel switching — future phase
- Tenant settings/configuration panel — future phase

</deferred>

---

*Phase: 15-tenant-per-codebase-fix-and-ui-overhaul-tenant-scoping-sidebar-navigation-and-channel-management*
*Context gathered: 2026-03-08*
