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
---

<objective>
Launch a continuous, autonomous build loop. Each phase is delegated to a fresh agent with full 200k context. The orchestrator (this conversation) stays ultra-thin — just a loop that spawns agents and reads results. Never stops, never pauses for context limits.
</objective>

<critical_architecture>

## Why This Works

The orchestrator NEVER does heavy work. It NEVER uses Skill tool (which runs in same context). Instead:

1. **Each phase → one Agent** with fresh 200k context
2. The agent runs the FULL GSD chain internally: discuss → plan → execute → verify
3. Agent returns summary. Orchestrator reads it, spawns next phase.
4. Orchestrator context stays <10% — can loop indefinitely.

**DO NOT use Skill tool.** Skill runs in your context and fills it up. Always use Agent tool.

</critical_architecture>

<process>

## 1. Initialize (tiny — just read state)

```bash
INIT=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Read `.planning/ROADMAP.md` to get phase list. Parse `--from` / `--to` from $ARGUMENTS.

Enable auto-advance:
```bash
node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow.auto_advance true
node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active true
```

## 2. Phase Loop

For each incomplete phase from `start_phase` to `end_phase`:

### 2a. Spawn Phase Agent

**CRITICAL: Use Agent tool, NOT Skill tool.** The agent gets fresh context.

```
Agent(
  name="phase-{N}-builder",
  subagent_type="general-purpose",
  model="sonnet",
  mode="bypassPermissions",
  description="Build Phase {N}: {name}",
  prompt="
    You are building Phase {N}: {phase_name} of the AgentChat project.

    Your job: Run the FULL GSD lifecycle for this phase. Use the Skill tool for each step.

    ## Steps

    1. Run: Skill(skill='gsd:discuss-phase', args='{N} --auto')
       - This auto-chains: discuss → plan → execute → verify
       - If it completes the full chain, you're done
       - If it stops partway (gaps, errors), handle it:
         - GAPS FOUND → Run: Skill(skill='gsd:plan-phase', args='{N} --gaps')
         - Then: Skill(skill='gsd:execute-phase', args='{N} --gaps-only')
         - PLANNING INCOMPLETE → Run: Skill(skill='gsd:plan-phase', args='{N} --auto')
         - EXECUTION FAILED → Read the error, try to fix, re-run execute

    2. Verify completion:
       - Read .planning/ROADMAP.md
       - Confirm Phase {N} is marked complete
       - If not complete, diagnose and retry the failing step

    3. Return a summary:
       ## PHASE {N} COMPLETE
       - What was built
       - Files created/modified
       - Any issues encountered and how they were resolved
       - Any deferred ideas surfaced

    ## Rules
    - Do NOT ask the user questions. Make decisions autonomously.
    - If discuss-phase asks gray area questions, select 'All Claude's call' or make reasonable choices.
    - If verification fails, fix and retry (up to 3 times).
    - If truly stuck after 3 retries, return ## PHASE {N} BLOCKED with details.
  "
)
```

Wait for the agent to complete. Read its summary.

### 2b. Post-Phase: Dogfood Check (Phase 3+ only)

**After Phase 3 completes** (MCP server + HTTP API are built), spawn dogfood agent:

```
Agent(
  name="dogfooder",
  subagent_type="general-purpose",
  model="sonnet",
  description="Dogfood test the product",
  run_in_background=true,
  prompt="
    You are a dogfood tester for AgentChat — a local messaging service for agent teams.

    ## Setup
    1. Read .planning/ROADMAP.md and .planning/REQUIREMENTS.md
    2. Find the server entry point and start it: look for package.json scripts or main server file
    3. Start the server in background if not running

    ## Test the REST API
    Try each endpoint with curl:
    - POST to create a tenant
    - POST to create a channel
    - POST to send a message
    - GET to read messages back
    - GET to list channels

    ## Test Edge Cases
    - Empty channels
    - Multiple tenants (isolation)
    - Thread replies
    - Large message volume

    ## Think Like an Agent Team Member
    Try things an agent team would need day-to-day:
    - 'What happened in the last hour?'
    - 'Summarize channel activity'
    - 'Who is active right now?'
    - 'Search for messages about X'

    ## Output
    Report what works, what's broken, and what's MISSING.

    ## Working Features
    [list]

    ## Issues Found
    [list with reproduction steps]

    ## Missing Features (things I wished I could do)
    [list — these become new requirements]

    ## Suggested New Requirements
    [specific, testable requirements in REQ-ID format]
  "
)
```

Collect dogfood feedback. For genuine gaps (not nice-to-haves):
- Add requirement to REQUIREMENTS.md
- Use `Skill(skill='gsd:add-phase')` to create a new phase
- The loop will pick it up

### 2c. Post-Phase: Design Review (Phase 5+ only)

After Phase 5 (UI), spawn design reviewer:

```
Agent(
  name="design-reviewer",
  subagent_type="general-purpose",
  model="sonnet",
  description="Audit UI design quality",
  run_in_background=true,
  prompt="
    You are a UI/UX design reviewer for AgentChat.

    ## Audit Checklist
    1. Read all UI source code (find with: find . -name '*.tsx' -path '*/client/*' or similar)
    2. Check:
       - ShadCN component usage (should use shadcn/ui, not raw HTML)
       - Tailwind CSS v4 patterns
       - Responsive sidebar + main content layout
       - Accessibility (ARIA labels, keyboard nav, contrast)
       - Visual hierarchy (message bubbles, sender identity, timestamps)
       - Loading states, empty states, error states
       - Dark mode support
       - Real-time indicators (new message animations)

    3. Rate each: Good / Needs Work / Missing

    ## Output
    ## Design Audit Report
    ### Component Quality
    ### Layout & Navigation
    ### Visual Polish
    ### Accessibility
    ### Critical Issues (must fix)
    ### Recommendations (with file paths and code suggestions)
  "
)
```

For critical design issues, create an insert-phase to fix.

### 2d. Continue Loop

After phase agent returns, move to next phase. DO NOT stop. DO NOT suggest /clear. Just spawn the next agent.

If agent returned BLOCKED, try to unblock:
1. Read the blocker details
2. If fixable (missing file, config issue), fix it and re-spawn
3. If truly stuck, inform user but continue to next phase

## 3. Completion

When all phases done, run final dogfood + design review pass, then:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 BUILD COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<rules>
- NEVER use Skill tool in the orchestrator — it eats your context
- NEVER stop the loop for context warnings — agents have fresh context
- NEVER suggest /clear or manual commands — this is autonomous
- The orchestrator is a LOOP, not a worker. It spawns, waits, spawns next.
- Keep orchestrator output minimal — just phase transition banners
- Each Agent gets fresh 200k context — they do the heavy lifting
</rules>
