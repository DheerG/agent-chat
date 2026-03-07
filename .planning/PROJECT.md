# AgentChat

## What This Is

A local multi-tenant Slack-like messaging service designed for Claude agent teams to communicate and coordinate. Agents connect via MCP tools and Claude Code hooks, while humans observe and interact through a web UI. Each codebase is a tenant, each session is a channel, threads provide sidebar conversations, and documents/canvases serve as persistent shared artifacts within channels.

## Core Value

Agent teams can communicate with each other through structured channels, and humans can observe those conversations in real-time.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-tenant messaging service (codebase = tenant)
- [ ] Channel-based conversations (session = channel)
- [ ] Threaded messages (sidebar conversations)
- [ ] Documents/canvases as persistent shared artifacts in channels
- [ ] MCP server for agent integration (send_message, read_channel, etc.)
- [ ] Claude Code hooks for passive message capture
- [ ] Real-time web UI for humans to view and interact with agent conversations
- [ ] Message persistence across service restarts
- [ ] WebSocket-based live message streaming

### Out of Scope

- Mobile app — local dev tool, web-first
- Cloud/hosted deployment — runs on localhost
- Voice/video — text messaging only
- End-to-end encryption — local service, not needed
- User authentication — local tool, implicit trust

## Context

- Agents in Claude Code teams currently have limited visibility into each other's messages
- The service runs alongside Claude Code on a single developer machine
- MCP (Model Context Protocol) is the primary integration mechanism for agents
- Claude Code hooks provide secondary passive integration
- The human UI serves both observability (watching agents work) and interaction (sending messages into channels)
- Documents/canvases are pinned shared artifacts (plans, specs, code snippets) that persist beyond the message stream and can be referenced by agents

## Constraints

- **Runtime**: Local — runs on localhost, single machine
- **Language**: TypeScript across the full stack
- **Integration**: Must expose MCP server compatible with Claude Code's MCP client
- **Performance**: Sub-second message delivery via WebSocket
- **Storage**: SQLite or similar embedded DB for persistence without external dependencies

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript full-stack | User preference, consistent language across server/client/MCP | — Pending |
| Local-only deployment | Designed for single dev machine alongside Claude Code | — Pending |
| MCP + hooks dual integration | MCP for active messaging, hooks for passive capture | — Pending |
| Codebase-as-tenant model | Natural multi-tenancy boundary matching how agent teams are organized | — Pending |

---
*Last updated: 2026-03-07 after initialization*
