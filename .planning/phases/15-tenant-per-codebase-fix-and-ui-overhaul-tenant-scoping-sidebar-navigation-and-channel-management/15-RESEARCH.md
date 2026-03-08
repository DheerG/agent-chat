# Phase 15: Tenant-per-codebase fix and UI overhaul - Research

**Completed:** 2026-03-08

## 1. Tenant Identity Bug Analysis

### Current Behavior
`TeamInboxWatcher.processTeam()` at line 160-163 calls:
```typescript
const tenant = await this.services.tenants.upsertByCodebasePath(
  teamName,
  teamPath,  // join(this.teamsDir, teamName) e.g. ~/.claude/teams/my-project
);
```

The `teamPath` is the team's directory under `~/.claude/teams/`, NOT the actual codebase path where agents work. This means:
- Two different teams working on the same codebase create TWO separate tenants
- The `codebasePath` field in the tenant row holds a team directory path, not a project path

### Team Config Structure
Team config at `~/.claude/teams/{teamName}/config.json`:
```json
{
  "name": "team-name",
  "members": [
    { "agentId": "...", "name": "worker-1", "cwd": "/Users/dheer/code/personal/agent-chat" },
    { "agentId": "...", "name": "worker-2", "cwd": "/Users/dheer/code/personal/agent-chat" }
  ]
}
```

The `cwd` field on members contains the actual codebase path. All members in a team share the same codebase.

### Fix Strategy
1. In `processTeam()`, after reading config, extract `config.members[0]?.cwd` as the canonical codebase path
2. If no member has `cwd`, fall back to `teamPath` for backward compatibility
3. Use `basename(codebasePath)` as the tenant name for human readability (e.g. "agent-chat" instead of "my-project-team")
4. Each team still gets its own channel named after the team within the shared tenant
5. Existing `upsertByCodebasePath` service method works perfectly — just pass the correct codebasePath

### Impact on Existing Tests
- `TeamInboxWatcher.test.ts` creates mock team configs. Tests need updating to include `cwd` in member configs
- The upsert function itself (`TenantService.upsertByCodebasePath`) doesn't need changes — it already handles merge/restore correctly
- No schema changes needed — the `codebasePath` column already exists with the right semantics

## 2. Current UI Architecture

### Component Hierarchy
```
App.tsx
├── Sidebar.tsx (260px fixed width, dark background)
│   ├── TenantGroup (one per tenant, collapsible)
│   │   ├── tenant header (name, channel count, archive button)
│   │   └── channel list (flat list of channels)
│   └── ArchivedSection (collapsed by default)
├── main-content
│   ├── MessageFeed.tsx
│   │   ├── MessageItem.tsx (per message)
│   │   │   ├── EventCard.tsx (for hook/event messages)
│   │   │   ├── TeamEventCard.tsx (for team inbox events)
│   │   │   └── MessageContent.tsx (markdown rendering)
│   │   └── ComposeInput.tsx
│   └── DocumentPanel.tsx
└── ThreadPanel.tsx (conditional, right side)
```

### State Management
- All state lifted to `App.tsx`: `selectedTenantId`, `selectedChannelId`, `selectedThread`, `refreshKey`
- Hooks: `useTenants`, `useChannels`, `useMessages`, `useDocuments`, `usePresence`, `useWebSocket`
- WebSocket: subscribe/unsubscribe per channel via `useWebSocket` hook

### CSS Design System
- CSS custom properties on `:root` in `App.css`
- Component-scoped CSS files (not CSS modules — direct import)
- Dark sidebar (#1a1a2e), white content area
- System font stack: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto

## 3. UI Overhaul Plan

### Sidebar Refactor
**Current**: All tenants expanded with channels nested under each. Flat rendering of every tenant.
**Target**: Tenant selector at top + flat channel list for selected tenant only.

Implementation approach:
- Add a `TenantSwitcher` component at top of sidebar (dropdown/select showing tenant names)
- The `selectedTenantId` state already exists in App.tsx — just need to surface it
- Remove `TenantGroup` component — replace with flat channel list
- Keep `ArchivedSection` at bottom but scope it to selected tenant
- Persist last selected tenant in `localStorage`

### Channel Header Bar
**Current**: No indication of which channel/tenant you're viewing in the main content area.
**Target**: Header bar between sidebar and message feed.

Implementation:
- New `ChannelHeader` component placed at top of `main-content`
- Shows: channel name (large), tenant name (small subtitle), codebase path (very small)
- Clean minimal design — white background with bottom border

### Message Grouping
**Current**: Every message shows avatar + sender name + timestamp.
**Target**: Consecutive messages from same sender within 5 minutes grouped — avatar shown only on first.

Implementation:
- In `MessageFeed.tsx`, compute grouping: compare `senderId` and `createdAt` between consecutive messages
- Pass `isGrouped` boolean to `MessageItem`
- Grouped messages: skip avatar, reduce top padding, skip sender name
- First message in group: full display with avatar and name

### Date Separators
**Current**: No visual separation between days.
**Target**: Subtle "Today", "Yesterday", "March 8, 2026" separators.

Implementation:
- In `MessageFeed.tsx`, insert date separator elements between messages from different days
- Simple centered text with horizontal lines

### Empty State
**Current**: Plain "Select a channel to start" text.
**Target**: Friendlier empty state with context.

### Compose Input
**Current**: Basic input with send button.
**Target**: Slightly improved with better border separation and visual weight.

## 4. Validation Architecture

### Backend Validation
1. **Tenant identity fix**: Create a team config with `cwd` fields, verify `upsertByCodebasePath` receives the actual codebase path
2. **Multiple teams, same codebase**: Two teams with different names but same `cwd` should map to the same tenant
3. **Backward compatibility**: Team config without `cwd` should still work (falls back to team path)

### Frontend Validation
1. **Tenant switcher**: Selecting a tenant loads its channels only
2. **Channel header**: Displays correct tenant and channel names
3. **Message grouping**: Consecutive messages from same sender grouped correctly
4. **Date separators**: Appear between messages from different days
5. **localStorage persistence**: Selected tenant survives page reload

### Test Strategy
- **Unit tests**: TeamInboxWatcher with cwd extraction, message grouping logic
- **Component tests**: TenantSwitcher, ChannelHeader, grouped MessageItem
- **Integration tests**: Full flow — select tenant, view channels, send message

## 5. Files to Modify

### Server (Backend)
- `packages/server/src/watcher/TeamInboxWatcher.ts` — extract cwd from config, use as codebasePath
- `packages/server/src/watcher/__tests__/TeamInboxWatcher.test.ts` — update tests

### Client (Frontend)
- `packages/client/src/App.tsx` — add ChannelHeader, restructure layout
- `packages/client/src/App.css` — update layout styles
- `packages/client/src/components/Sidebar.tsx` — major refactor: tenant switcher + flat channel list
- `packages/client/src/components/Sidebar.css` — new styles for tenant switcher
- `packages/client/src/components/MessageFeed.tsx` — message grouping, date separators
- `packages/client/src/components/MessageFeed.css` — grouping and separator styles
- `packages/client/src/components/MessageItem.tsx` — grouped message variant
- `packages/client/src/components/MessageItem.css` — grouped styles
- `packages/client/src/components/ComposeInput.css` — visual improvements
- NEW: `packages/client/src/components/ChannelHeader.tsx` — channel/tenant context display
- NEW: `packages/client/src/components/ChannelHeader.css` — header styles
- `packages/client/src/hooks/useTenants.ts` — possibly add localStorage persistence
- `packages/client/src/__tests__/Sidebar.test.tsx` — update for new structure
- `packages/client/src/__tests__/MessageFeed.test.tsx` — test grouping/separators

## RESEARCH COMPLETE
