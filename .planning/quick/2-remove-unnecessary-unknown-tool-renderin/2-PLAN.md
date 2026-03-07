---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/client/src/components/MessageItem.tsx
  - packages/client/src/__tests__/EventCard.test.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Team inbox system messages (idle_notification, shutdown_request) do not appear in the message feed"
    - "MCP tool call events (PreToolUse, PostToolUse with toolName) still render as EventCards"
    - "Regular team inbox text messages still render normally"
  artifacts:
    - path: "packages/client/src/components/MessageItem.tsx"
      provides: "Filtering logic for team inbox system events"
      contains: "team_inbox"
  key_links:
    - from: "packages/client/src/components/MessageItem.tsx"
      to: "packages/client/src/components/EventCard.tsx"
      via: "conditional rendering — only route to EventCard when NOT a team inbox system event"
      pattern: "source.*team_inbox"
---

<objective>
Filter out team inbox system messages (idle_notification, shutdown_request, etc.) that currently render as "Unknown Tool" EventCards in the UI.

Purpose: These structured JSON messages from ~/.claude/teams/ inboxes are ingested with messageType='event' and metadata.original_type set, but EventCard expects toolName metadata which they lack. They are system noise — users want agent conversations, not idle/shutdown chatter.

Output: MessageItem.tsx filters team inbox events so they return null instead of rendering as broken EventCards. Existing MCP tool call EventCards remain unaffected.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/client/src/components/MessageItem.tsx
@packages/client/src/components/EventCard.tsx
@packages/client/src/__tests__/EventCard.test.tsx
@packages/server/src/watcher/TeamInboxWatcher.ts

<interfaces>
<!-- From packages/shared/src/types.ts -->
Message.messageType: 'text' | 'event' | 'hook'
Message.metadata: Record<string, unknown>

<!-- Team inbox event messages have these metadata fields (set by TeamInboxWatcher): -->
metadata.source = 'team_inbox'
metadata.original_type = 'idle_notification' | 'shutdown_request' | etc.
metadata.recipient = string (inbox owner name)

<!-- MCP tool call event messages have these metadata fields: -->
metadata.toolName = 'Read' | 'Write' | etc.
metadata.arguments = object
metadata.result = string | object
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Filter team inbox system events in MessageItem and add tests</name>
  <files>packages/client/src/components/MessageItem.tsx, packages/client/src/__tests__/EventCard.test.tsx</files>
  <action>
In `packages/client/src/components/MessageItem.tsx`, add a filter BEFORE the EventCard rendering block (line 58). The filter should return `null` for messages that are team inbox system events:

```typescript
// Team inbox system events (idle_notification, shutdown_request, etc.) — filter out noise
if (
  (message.messageType === 'event' || message.messageType === 'hook') &&
  message.metadata?.source === 'team_inbox'
) {
  return null;
}
```

This goes AFTER the system message check (line 49) and BEFORE the existing EventCard check (line 58). The key discriminator is `metadata.source === 'team_inbox'` — all team inbox structured messages have this set by TeamInboxWatcher (line 277 in TeamInboxWatcher.ts). MCP tool call events do NOT have `source: 'team_inbox'`, so they continue to render as EventCards normally.

In `packages/client/src/__tests__/EventCard.test.tsx`, add tests at the end of the file. Import `MessageItem` alongside `EventCard` and add a new describe block:

```typescript
import { MessageItem } from '../components/MessageItem';
```

Add describe('MessageItem - team inbox system events'):
1. Test "filters out team inbox idle_notification events": Create a message with messageType='event', metadata={ source: 'team_inbox', original_type: 'idle_notification' }. Render `<MessageItem message={msg} />`. Use container query to assert nothing rendered (container.firstChild should be null).
2. Test "filters out team inbox shutdown_request events": Same but with original_type: 'shutdown_request'.
3. Test "still renders MCP tool call events as EventCard": Create a message with messageType='event', metadata={ toolName: 'Read', arguments: { file: 'test.ts' } } (no source field). Render `<MessageItem message={msg} />`. Assert screen.getByTestId('event-card') is in the document.
4. Test "still renders regular team inbox text messages": Create a message with messageType='text', metadata={ source: 'team_inbox' }, senderType='agent'. Render `<MessageItem message={msg} />`. Assert screen.getByTestId('message-item') is in the document.

Use the existing `createEventMessage` helper for the base message, applying overrides for each case.
  </action>
  <verify>
    <automated>cd /Users/dheer/code/personal/agent-chat && npx vitest run packages/client/src/__tests__/EventCard.test.tsx --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
  - Team inbox system events (idle_notification, shutdown_request) return null from MessageItem — not rendered
  - MCP tool call events with toolName in metadata still render as EventCards
  - Regular text messages from team inboxes still render as normal agent messages
  - All existing EventCard tests continue to pass
  - New tests cover the filtering behavior
  </done>
</task>

</tasks>

<verification>
```bash
# Run all client tests to verify no regressions
cd /Users/dheer/code/personal/agent-chat && npx vitest run --project client --reporter=verbose 2>&1 | tail -30
```
</verification>

<success_criteria>
- Team inbox system messages no longer appear as "Unknown Tool" EventCards
- MCP tool call EventCards render correctly (no regression)
- Regular team inbox text messages render correctly (no regression)
- All 65+ existing client tests pass plus new filtering tests
</success_criteria>

<output>
After completion, create `.planning/quick/2-remove-unnecessary-unknown-tool-renderin/2-SUMMARY.md`
</output>
