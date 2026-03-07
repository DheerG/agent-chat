---
name: build
description: Launch autonomous build loop with dogfooding agent team
argument-hint: "[--from <phase>] [--to <phase>]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - SlashCommand
---

<objective>
Launch a continuous, autonomous build loop. A small agent team builds the project phase-by-phase using the GSD workflow, and once the product is usable, dogfoods it — using the built software to coordinate, surfacing missing features, and creating new phases to address them.

The command is thin: it sets up the team, configures auto-advance, and enters the build loop. The GSD infrastructure handles the heavy lifting.
</objective>

<team>

## Team Structure

The lead (this conversation) orchestrates. Specialists are spawned at the right moments:

| Role | When Spawned | Purpose |
|------|-------------|---------|
| **Lead** | Immediately (this conversation) | Runs GSD loop: discuss → plan → execute → verify per phase |
| **Dogfooder** | After Phase 3 (MCP ready) | Actively uses the product via MCP tools, reports missing features |
| **Design Reviewer** | During Phase 5 (UI phase) | Reviews UI for quality, ShadCN usage, modern patterns, accessibility |

The dogfooder and design reviewer report back to the lead. If they surface gaps, the lead creates new phases via `/gsd:insert-phase` or `/gsd:add-phase`.

</team>

<process>

## 1. Initialize

Read project state:

```bash
INIT=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse for: `current_phase`, `next_phase`, `phase_count`, `project_name`.

Read `.planning/ROADMAP.md` and `.planning/config.json`.

**Parse arguments:**
- `--from N` → start from phase N (default: next incomplete phase)
- `--to N` → stop after phase N (default: last phase)

## 2. Configure Auto-Advance

Enable continuous execution:

```bash
node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow.auto_advance true
node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active true
```

## 3. Build Loop

For each phase from `start_phase` to `end_phase`:

### 3a. Run GSD Phase Lifecycle

Use the Skill tool to chain through:

```
Skill(skill="gsd:discuss-phase", args="{phase} --auto")
```

The `--auto` flag chains: discuss → plan → execute → verify → transition automatically. Each step spawns fresh subagents with full context.

Wait for the chain to complete. It will return after the phase is done (or if it hits an unresolvable issue).

### 3b. Post-Phase: Dogfood Check (Phase 3+)

**After Phase 3 completes** (MCP server + hooks are built):

1. **Start the service** (if not running):
   ```bash
   # Start AgentChat server in background
   npm run dev &
   ```

2. **Spawn dogfood agent** in background:
   ```
   Agent(
     name="dogfooder",
     subagent_type="general-purpose",
     model="sonnet",
     description="Dogfood the product",
     run_in_background=true,
     prompt="
       You are a dogfood tester for AgentChat — a messaging service for agent teams.

       The service should be running on localhost. Your job:

       1. Read .planning/ROADMAP.md and .planning/REQUIREMENTS.md to understand what's built
       2. Try using the MCP tools that were built:
          - send_message: Send a test message to a channel
          - read_channel: Read messages from a channel
          - list_channels: List available channels
       3. Try the REST API directly:
          - POST /api/messages — send a message
          - GET /api/channels — list channels
          - GET /api/channels/:id/messages — read history
       4. Test edge cases:
          - What happens with empty channels?
          - Can you get summaries of recent activity?
          - Can you search for specific messages?
          - Can you tell which agents are active?

       For each thing you try, report:
       - What you tried
       - What happened (success/failure)
       - What you WISH you could do but can't (missing features)

       Be creative. Think about what an agent team would need day-to-day:
       - 'Show me what happened in the last hour'
       - 'Summarize the discussion in channel X'
       - 'Who is currently active?'
       - 'What decisions were made today?'

       Output a structured report with:
       ## Working Features
       ## Issues Found
       ## Missing Features (things I wished I could do)
       ## Suggestions for New Requirements
     "
   )
   ```

3. **Collect feedback** when the dogfood agent completes. For each missing feature or suggestion:
   - If it's a natural fit within the current roadmap: note it for an existing future phase
   - If it requires new work: use Skill(skill="gsd:add-phase") or Skill(skill="gsd:insert-phase") to create a new phase
   - Add new requirements to REQUIREMENTS.md

**After every subsequent phase**, re-run the dogfood agent to test the latest state.

### 3c. Post-Phase: Design Review (Phase 5+)

**After Phase 5 completes** (UI is built):

Spawn design reviewer agent:
```
Agent(
  name="design-reviewer",
  subagent_type="general-purpose",
  model="sonnet",
  description="Review UI design quality",
  run_in_background=true,
  prompt="
    You are a UI/UX design reviewer for AgentChat — a Slack-like messaging app for agent teams.

    Your job:
    1. Read the UI source code (src/client/ or similar)
    2. Check for:
       - ShadCN component usage (should use shadcn/ui for all standard components)
       - Tailwind CSS v4 patterns (modern utility-first styling)
       - Responsive layout (sidebar + main content)
       - Accessibility (ARIA labels, keyboard navigation, color contrast)
       - Visual hierarchy (message bubbles, sender identity, timestamps)
       - Thread expansion UX (inline vs sidebar)
       - Loading states and empty states
       - Error handling UI (connection lost, message send failed)
       - Dark mode support
       - Real-time update indicators (new message animations, typing indicators)

    3. Compare against modern messaging UIs (Slack, Discord, Linear)

    4. Rate each area: Good / Needs Work / Missing

    Output a structured report:
    ## Design Audit
    ### Component Quality (ShadCN usage, consistency)
    ### Layout & Navigation
    ### Visual Polish
    ### Accessibility
    ### Missing UI Patterns
    ### Specific Recommendations (with file paths and suggested changes)
  "
)
```

Collect feedback. For design issues:
- Critical issues (broken UX, inaccessible) → create an insert-phase to fix immediately
- Polish items → add to a future phase or note for the current phase

### 3d. Advance

If the phase chain didn't auto-advance (e.g., verification failed), handle the blocker:
- If gaps found: let the auto chain handle gap closure
- If manual intervention needed: present the issue and wait for user input

Then continue the loop to the next phase.

## 4. Completion

When all phases are done:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 BUILD COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All phases executed, verified, and dogfooded.
```

Run one final dogfood + design review pass, then present summary.

</process>

<dogfooding_strategy>

## Dogfooding Escalation Path

When the dogfood agent reports a missing feature:

1. **Evaluate**: Is this a genuine gap or a nice-to-have?
   - Genuine gap: agents can't do their basic coordination job without it
   - Nice-to-have: would be useful but isn't blocking

2. **For genuine gaps**:
   - Create a new requirement in REQUIREMENTS.md (e.g., AGNT-10, UI-07)
   - Use `/gsd:insert-phase` to add a phase addressing the gap
   - The build loop picks it up in the next iteration

3. **For nice-to-haves**:
   - Add to v2 requirements in REQUIREMENTS.md
   - Log in STATE.md under discoveries

4. **Common dogfood-surfaced features** (expect these):
   - Message search / filtering
   - Activity summaries ("what happened while I was idle?")
   - Channel notifications / unread counts
   - Agent status dashboard
   - Message pinning / bookmarking
   - Conversation export

</dogfooding_strategy>

<success_criteria>
- [ ] Auto-advance configured
- [ ] Each phase completes: discuss → plan → execute → verify
- [ ] Dogfood agent runs after Phase 3+ and reports findings
- [ ] Design reviewer runs after Phase 5+ and reports findings
- [ ] Missing features from dogfooding become new phases/requirements
- [ ] All originally planned phases complete
- [ ] All dogfood-generated phases complete
- [ ] Final dogfood pass confirms product is self-sufficient for agent team use
</success_criteria>
