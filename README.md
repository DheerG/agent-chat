# AgentChat

**See what your AI agents are actually saying to each other.**

When you run Claude Code agent teams or swarms, the agents coordinate through file-based inboxes that are invisible to you. AgentChat gives you a real-time web UI to watch those conversations unfold, understand what your agents are doing, and step in when they need help.

## Why AgentChat?

- **Visibility** -- Agent teams produce dozens of messages per minute. Without a UI you're left tailing JSON files or waiting for the final result and hoping nothing went wrong.
- **Live status** -- See which agents are active, idle, or stopped at a glance. Know when an agent is blocked and needs your input before it stalls the whole team.
- **Zero config for teams** -- AgentChat watches `~/.claude/teams/` automatically. Start a Claude Code team session and the conversation appears in the UI within seconds.
- **Works with any codebase** -- Run one setup script and your project's agents can send and read messages through AgentChat. Remove it just as easily.
- **Human-in-the-loop** -- You're not just watching. Send messages into the conversation, answer agent questions, and steer the team when they go off track.

## Quick Start

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9

git clone https://github.com/DheerG/agent-chat.git
cd agent-chat
pnpm install
pnpm build

# Start the server + UI
pnpm dev
```

The web UI opens at **http://localhost:5173**. The API server runs on **http://localhost:5555**. A SQLite database is created automatically at `~/.agent-chat/data.db`.

Any active Claude Code team sessions in `~/.claude/teams/` will appear in the sidebar automatically.

### Add AgentChat to an existing project

```bash
./scripts/setup.sh /path/to/your/project
```

This configures Claude Code hooks and MCP server entries in your project's `.claude/settings.json` so agents can communicate through AgentChat. To remove it:

```bash
./scripts/teardown.sh /path/to/your/project
```

## What you see

- **Conversation sidebar** -- All your team conversations in one place, sorted by activity. Toggle between team chats and all sessions. Auto-refreshes every 60 seconds.
- **Agent status pills** -- Every team member shown with real-time status: green (active), yellow (idle), blue (pending), grey (stopped).
- **Structured events** -- Task assignments, completions, idle notifications, shutdown approvals, and other agent protocol messages are rendered as human-readable cards instead of raw JSON.
- **Activity batches** -- Tool calls are grouped into collapsible summaries so the feed stays readable even during heavy agent activity.
- **Unread indicators** -- Badge counts and tab title updates so you know when something needs attention, even in a background tab.

## How it works

```
  Claude Code agents            AgentChat server           Web UI
  ─────────────────            ────────────────           ──────
  Write to team inboxes  ──>   File watcher picks up  ──>  WebSocket push
  Use MCP tools          ──>   HTTP API + SQLite      ──>  Real-time feed
  Hook events            ──>   Event ingestion        ──>  Activity batches
```

AgentChat runs entirely on your machine. No data leaves localhost. The server watches your `~/.claude/teams/` directory for agent messages and ingests them into a local SQLite database. The React UI connects over WebSocket for real-time updates.

## Project structure

```
agent-chat/
├── packages/
│   ├── server/     HTTP API, SQLite, WebSocket hub, team inbox watcher
│   ├── client/     React UI
│   ├── mcp/        MCP server for Claude Code agents
│   └── shared/     Types and schema shared across packages
├── scripts/
│   ├── setup.sh    Wire a project into AgentChat
│   └── teardown.sh Remove AgentChat from a project
└── pnpm-workspace.yaml
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5555` | HTTP server port |
| `AGENT_CHAT_DB_PATH` | `~/.agent-chat/data.db` | SQLite database path |
| `TEAMS_DIR` | `~/.claude/teams/` | Directory to watch for team conversations |

## Development

```bash
pnpm dev            # Server + client with hot reload
pnpm build          # Production build
pnpm test           # Run all tests
pnpm typecheck      # Type checking only
```

## Tech stack

TypeScript, React, Hono, SQLite (via better-sqlite3 + Drizzle ORM), WebSocket, Model Context Protocol SDK. Full details in each package's `package.json`.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
