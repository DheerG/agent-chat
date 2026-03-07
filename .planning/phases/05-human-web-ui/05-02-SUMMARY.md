---
phase: 05-human-web-ui
plan: 02
subsystem: message-feed
tags: websocket, messages, compose, events, real-time

requires:
  - phase: 05-human-web-ui
    plan: 01
    provides: packages/client scaffold, lib/api.ts

provides:
  - useWebSocket hook with reconnect (exponential backoff 1s-30s)
  - useMessages hook with REST fetch + WS deduplication + lastSeenId tracking
  - MessageFeed component with auto-scroll and "N new messages" indicator
  - MessageItem component with agent/human/system rendering + presence dots + thread links
  - ComposeInput component with auto-grow textarea + Enter/Shift+Enter support
  - EventCard component with collapsible tool call display

affects: [05-03-thread-panel]

tech-stack:
  added: []
  patterns: [websocket-reconnect-backoff, message-deduplication-via-set, auto-scroll-bottom-detection, collapsible-card-pattern]

key-files:
  created:
    - packages/client/src/hooks/useWebSocket.ts
    - packages/client/src/hooks/useMessages.ts
    - packages/client/src/components/MessageFeed.tsx
    - packages/client/src/components/MessageFeed.css
    - packages/client/src/components/MessageItem.tsx
    - packages/client/src/components/MessageItem.css
    - packages/client/src/components/ComposeInput.tsx
    - packages/client/src/components/ComposeInput.css
    - packages/client/src/components/EventCard.tsx
    - packages/client/src/components/EventCard.css
    - packages/client/src/__tests__/MessageFeed.test.tsx
    - packages/client/src/__tests__/ComposeInput.test.tsx
    - packages/client/src/__tests__/EventCard.test.tsx

key-decisions:
  - "WebSocket uses exponential backoff (1s, 2s, 4s, ... max 30s) for reconnection"
  - "useMessages deduplicates via Set<string> to handle REST+WS race conditions"
  - "MessageFeed auto-scrolls only when user is already at bottom (40px threshold)"
  - "EventCard shows toolName collapsed, arguments/result expanded on click"
  - "System messages render centered and muted, event messages delegate to EventCard"
  - "Thread reply count computed from full message list and shown as clickable link"

requirements-completed: [UI-01, UI-02, UI-05]

duration: 25min
completed: 2026-03-07
---

# Phase 05-02: Message Feed + Compose + Event Cards Summary

**Built the core messaging experience with real-time WebSocket delivery, compose input, and collapsible event cards.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-03-07
- **Tasks:** 3 completed
- **Files created:** 13

## Accomplishments
- Created useWebSocket hook with automatic reconnect and exponential backoff
- Created useMessages hook with REST initial load (50 messages) + WS dedup + addMessage
- Built MessageFeed with auto-scroll, bottom detection, and "N new messages" banner
- Built MessageItem with differentiated rendering for agent/human/system/event types
- Built ComposeInput with auto-grow textarea, Enter to send, Shift+Enter for newline
- Built EventCard with collapsible tool call display (toolName, arguments, result)
- All 25 client tests pass (6 Sidebar + 7 ComposeInput + 6 EventCard + 6 MessageFeed)

## Task Commits

1. **Task 1: WebSocket and message hooks** - `63fffed`
2. **Task 2: MessageFeed, MessageItem, ComposeInput, EventCard** - `63fffed`
3. **Task 3: Component tests** - `63fffed`

## Files Created/Modified
- `packages/client/src/hooks/useWebSocket.ts` - WS with reconnect and channel multiplexing
- `packages/client/src/hooks/useMessages.ts` - REST fetch + dedup + lastSeenId
- `packages/client/src/components/MessageFeed.tsx` - Auto-scrolling message list
- `packages/client/src/components/MessageItem.tsx` - Multi-type message rendering
- `packages/client/src/components/ComposeInput.tsx` - Auto-grow textarea with send
- `packages/client/src/components/EventCard.tsx` - Collapsible tool call card
