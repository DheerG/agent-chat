---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/client/src/components/TeamEventCard.tsx
  - packages/client/src/components/TeamEventCard.css
  - packages/client/src/components/MessageItem.tsx
  - packages/client/src/__tests__/TeamEventCard.test.tsx
autonomous: true
requirements: [QUICK-3]
must_haves:
  truths:
    - "task_assignment events render as compact cards with task icon, subject, and assigned-by agent name"
    - "shutdown_request events render as compact cards with stop icon, reason text, and requesting agent"
    - "shutdown_approved events render as compact cards with checkmark icon and approving agent name"
    - "Team inbox events no longer show as 'Unknown Tool' EventCards"
    - "task_assignment cards have an expandable description section"
  artifacts:
    - path: "packages/client/src/components/TeamEventCard.tsx"
      provides: "Team event card component rendering task_assignment, shutdown_request, shutdown_approved"
      exports: ["TeamEventCard"]
    - path: "packages/client/src/components/TeamEventCard.css"
      provides: "Compact inline card styling using design tokens"
    - path: "packages/client/src/__tests__/TeamEventCard.test.tsx"
      provides: "Tests for all three event types and edge cases"
  key_links:
    - from: "packages/client/src/components/MessageItem.tsx"
      to: "packages/client/src/components/TeamEventCard.tsx"
      via: "conditional routing before EventCard fallback"
      pattern: "metadata\\.source.*team_inbox.*TeamEventCard"
---

<objective>
Render team inbox event messages (task_assignment, shutdown_request, shutdown_approved) as compact, styled inline cards instead of the generic "Unknown Tool" EventCard.

Purpose: Team coordination events are currently displayed as confusing "Unknown Tool" collapsible cards with raw JSON. They should render as clean, purpose-built system-style messages that are immediately readable.

Output: TeamEventCard component + CSS + tests + MessageItem routing
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/client/src/components/MessageItem.tsx
@packages/client/src/components/EventCard.tsx
@packages/client/src/components/EventCard.css
@packages/client/src/App.css

<interfaces>
<!-- Message type from @agent-chat/shared -->
From packages/shared/src/types.ts:
```typescript
export interface Message {
  id: string;
  channelId: string;
  tenantId: string;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system' | 'hook';
  content: string;
  messageType: 'text' | 'event' | 'hook';
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

<!-- Team event message structures (parsed from message.content JSON) -->
```typescript
// message.metadata.source === 'team_inbox'
// message.metadata.original_type === 'task_assignment' | 'shutdown_request' | 'shutdown_approved'
// message.content contains the raw JSON string of one of these:

interface TaskAssignmentEvent {
  type: 'task_assignment';
  taskId: string;
  subject: string;
  description: string;
  assignedBy: string;
  timestamp: string;
}

interface ShutdownRequestEvent {
  type: 'shutdown_request';
  requestId: string;
  from: string;
  reason: string;
  timestamp: string;
}

interface ShutdownApprovedEvent {
  type: 'shutdown_approved';
  requestId: string;
  from: string;
  timestamp: string;
}
```

<!-- Design tokens available (from App.css :root) -->
Key tokens: --color-bg-event, --color-text-body, --color-text-muted, --color-text-timestamp,
--color-border-input, --color-hover-light, --color-accent, --color-error,
--color-presence-active, --color-presence-idle
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create TeamEventCard component with CSS and tests</name>
  <files>
    packages/client/src/components/TeamEventCard.tsx,
    packages/client/src/components/TeamEventCard.css,
    packages/client/src/__tests__/TeamEventCard.test.tsx
  </files>
  <behavior>
    - Test: renders task_assignment with clipboard icon, subject text, and "Assigned by {agent}" label
    - Test: task_assignment description is hidden by default, clicking "Show details" reveals it
    - Test: renders shutdown_request with stop icon, "Shutdown requested" label, reason text, and "from {agent}"
    - Test: renders shutdown_approved with checkmark icon, "Shutdown approved" label, and "by {agent}"
    - Test: gracefully handles malformed/unparseable JSON content (renders nothing or fallback)
    - Test: has data-testid="team-event-card" on root element
  </behavior>
  <action>
    Create TeamEventCard.tsx that accepts a Message prop. The component:

    1. Parses `message.content` as JSON, extracting the event type from `message.metadata.original_type` (preferred) or falling back to parsed JSON `.type` field.

    2. Renders based on event type:

    **task_assignment:**
    - Icon: clipboard Unicode char (U+1F4CB or use a simpler "&#9998;" pencil / "&#9744;" ballot box)
    - Primary text: the `subject` field (truncated with ellipsis if very long)
    - Secondary: "Assigned by {assignedBy}" in muted text
    - Expandable: clicking a "Show details" link toggles `description` text below
    - Use useState for expand toggle

    **shutdown_request:**
    - Icon: red octagon/stop sign "&#9724;" solid square or "&#9632;" in error color
    - Primary: "Shutdown requested" in semi-bold
    - Secondary: `reason` text, "from {from}" in muted
    - No expand needed

    **shutdown_approved:**
    - Icon: checkmark "&#10003;" in green (--color-presence-active)
    - Primary: "Shutdown approved" in semi-bold
    - Secondary: "by {from}" in muted
    - No expand needed

    **Fallback:** If JSON parsing fails or type is unknown, return null (let EventCard handle it).

    Create TeamEventCard.css with compact inline card styling:
    - Similar layout to event-card but more compact (less padding, no full-width block)
    - Use flexbox row: icon | text content
    - Margin: `4px 16px` (same as event-card)
    - Background: `var(--color-bg-event)` with `border-radius: 8px`
    - Border: `1px solid var(--color-border-input)`
    - Padding: `6px 12px` (more compact than EventCard's 8px 12px)
    - Font size: 0.85rem for primary text, 0.75rem for secondary
    - Icon container: fixed 20px width, centered
    - DO NOT make the entire card a clickable button like EventCard (only task_assignment has the expand toggle)

    Create tests following the pattern in `packages/client/src/__tests__/EventCard.test.tsx`:
    - Use vitest, @testing-library/react, same createEventMessage helper pattern
    - Test messages should have `metadata: { source: 'team_inbox', original_type: '{type}' }` and `content` as a JSON string
  </action>
  <verify>
    <automated>cd /Users/dheer/code/personal/agent-chat && npx vitest run packages/client/src/__tests__/TeamEventCard.test.tsx</automated>
  </verify>
  <done>TeamEventCard renders all three event types with correct icons, text, and styling. Tests pass for task_assignment (with expand), shutdown_request, shutdown_approved, and malformed JSON fallback.</done>
</task>

<task type="auto">
  <name>Task 2: Route team inbox events to TeamEventCard in MessageItem</name>
  <files>packages/client/src/components/MessageItem.tsx</files>
  <action>
    In MessageItem.tsx, add the routing logic BETWEEN the existing idle_notification filter (line ~58-64) and the EventCard fallback (line ~67-69).

    1. Add import at top: `import { TeamEventCard } from './TeamEventCard';`

    2. After the idle_notification filter block and BEFORE the generic `if (message.messageType === 'event' || message.messageType === 'hook')` block, add:

    ```typescript
    // Team inbox structured events — render as compact inline cards
    if (
      (message.messageType === 'event' || message.messageType === 'hook') &&
      message.metadata?.source === 'team_inbox' &&
      message.metadata?.original_type &&
      ['task_assignment', 'shutdown_request', 'shutdown_approved'].includes(message.metadata.original_type as string)
    ) {
      return <TeamEventCard message={message} />;
    }
    ```

    This ensures:
    - idle_notification is still filtered out first (existing code, don't touch)
    - task_assignment, shutdown_request, shutdown_approved go to TeamEventCard
    - All other event/hook messages still fall through to the generic EventCard
    - Regular text messages are unaffected
  </action>
  <verify>
    <automated>cd /Users/dheer/code/personal/agent-chat && npx vitest run packages/client/src/__tests__/ && npx tsc --noEmit -p packages/client/tsconfig.json</automated>
  </verify>
  <done>Team inbox events (task_assignment, shutdown_request, shutdown_approved) route to TeamEventCard. All other events still route to EventCard. All existing tests pass. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
1. `npx vitest run packages/client/src/__tests__/TeamEventCard.test.tsx` — all TeamEventCard tests pass
2. `npx vitest run packages/client/src/__tests__/` — all existing client tests still pass (no regressions)
3. `npx tsc --noEmit -p packages/client/tsconfig.json` — no type errors
4. Visual: team inbox channels show compact styled cards for task assignments and shutdown events instead of "Unknown Tool" EventCards
</verification>

<success_criteria>
- TeamEventCard component renders task_assignment, shutdown_request, and shutdown_approved as compact, readable inline cards
- Each event type has a distinct icon (pencil/clipboard, stop, checkmark) and appropriate text layout
- task_assignment supports expandable description
- MessageItem correctly routes team inbox events to TeamEventCard while preserving all existing behavior
- All tests pass, TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/3-render-team-event-messages-task-assignme/3-SUMMARY.md`
</output>
