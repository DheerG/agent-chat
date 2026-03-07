---
phase: 09-ui-polish-fix-accessibility-contrast-dead-code-and-design-system-gaps-from-design-audit
plan: 02
subsystem: ui
tags: [react, accessibility, aria, a11y, confirm-dialog]

requires:
  - phase: 07-channel-and-tenant-archiving
    provides: Archive/restore UI with span role=button and window.confirm()
provides:
  - ConfirmDialog reusable component replacing window.confirm()
  - Keyboard-accessible archive buttons as real <button> elements
  - Working newCount indicator in MessageFeed
  - ARIA landmarks on sidebar, main, and thread panel
  - Screen reader support via role=log and aria-live on message list
affects: [ui, accessibility, archiving]

tech-stack:
  added: []
  patterns: [ConfirmDialog component pattern, ARIA landmark pattern, aria-live for log regions]

key-files:
  created:
    - packages/client/src/components/ConfirmDialog.tsx
    - packages/client/src/components/ConfirmDialog.css
  modified:
    - packages/client/src/components/Sidebar.tsx
    - packages/client/src/components/MessageFeed.tsx
    - packages/client/src/components/ThreadPanel.tsx
    - packages/client/src/App.tsx
    - packages/client/src/__tests__/Sidebar.test.tsx
    - packages/client/src/__tests__/MessageFeed.test.tsx

key-decisions:
  - "Used div with role=button for tenant headers and channel items to avoid nested button HTML invalidity"
  - "ConfirmDialog uses alertdialog role with aria-modal for proper screen reader behavior"
  - "prevMessageCount ref tracks message deltas for accurate newCount without double-counting"

patterns-established:
  - "ConfirmDialog: Reusable confirmation with overlay, ARIA alertdialog, and configurable labels"
  - "ARIA landmarks: aside(Channel navigation), main(Message area), aside(Thread replies)"
  - "Message log: role=log with aria-live=polite for screen reader announcements"

requirements-completed: []

duration: 8min
completed: 2026-03-07
---

# Phase 9, Plan 02: Accessibility & Functional Fixes Summary

**ConfirmDialog component, keyboard-accessible archive buttons, working new-message indicator, and complete ARIA landmark coverage**

## Performance

- **Duration:** 8 min
- **Tasks:** 5
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- Created ConfirmDialog component with full ARIA alertdialog support
- Converted archive span[role=button] to real <button> elements for keyboard access
- Replaced all window.confirm() calls with in-app ConfirmDialog
- Fixed dead newCount code — now tracks and displays new messages while scrolled up
- Added ARIA landmarks: sidebar, main content, and thread panel
- Added role=log and aria-live=polite to message list for screen readers
- Fixed 2 previously failing Sidebar tests, added 4 new tests (57 total, all passing)

## Task Commits

1. **Task 1-5: All accessibility and functional fixes** - `bae3765` (feat)

## Files Created/Modified
- `packages/client/src/components/ConfirmDialog.tsx` - New reusable confirmation dialog
- `packages/client/src/components/ConfirmDialog.css` - Dialog styling with design token fallbacks
- `packages/client/src/components/Sidebar.tsx` - Archive buttons as <button>, ConfirmDialog integration, aria-label
- `packages/client/src/components/MessageFeed.tsx` - Working newCount, role=log, aria-live
- `packages/client/src/components/ThreadPanel.tsx` - aria-label="Thread replies"
- `packages/client/src/App.tsx` - aria-label="Message area" on main
- `packages/client/src/__tests__/Sidebar.test.tsx` - Fixed archive tests for ConfirmDialog flow, added cancel test, added aria-label test
- `packages/client/src/__tests__/MessageFeed.test.tsx` - Added role=log test, added newCount indicator test

## Decisions Made
- Used div[role=button] for tenant headers and channel items to avoid HTML-invalid nested buttons
- Added keyboard handling (Enter/Space) to div[role=button] elements for accessibility
- Separated initial load effect from message tracking effect to prevent newCount reset on rerender
- Used prevMessageCount ref to compute accurate deltas instead of absolute counts

## Deviations from Plan

### Auto-fixed Issues

**1. MessageFeed initial load effect deps**
- **Found during:** Task 3 (newCount fix)
- **Issue:** Including messages.length in initial load effect deps caused it to reset prevMessageCount and isAtBottom on every new message
- **Fix:** Removed messages.length from initial load effect deps, kept it only for auto-scroll effect
- **Verification:** newCount test passes, all existing tests pass

## Issues Encountered
- jsdom Object.defineProperty on scrollTop needs writable:true for React effects to work in tests — fixed by adding writable flag

## Next Phase Readiness
- All accessibility gaps from design audit resolved
- ConfirmDialog available for future confirmation needs
- 193 tests passing across all packages (0 regressions)

---
*Phase: 09-ui-polish*
*Completed: 2026-03-07*
