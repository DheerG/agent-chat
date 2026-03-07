#!/usr/bin/env bash
# setup.sh — Configure a local codebase to use AgentChat
# Usage: ./scripts/setup.sh [TARGET_PROJECT_PATH]
#
# This script configures Claude Code hooks and MCP server entries
# in the target project's .claude/settings.json so that agents
# working in that project can communicate through AgentChat.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Target project: first argument or current directory
if [ $# -ge 1 ]; then
  TARGET_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
    echo "Error: Target directory not found: $1"
    exit 1
  }
else
  TARGET_DIR="$(pwd)"
fi

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------

# Check Node.js
command -v node >/dev/null 2>&1 || {
  echo "Error: Node.js is required but not found in PATH."
  echo "Install Node.js 20+ from https://nodejs.org"
  exit 1
}

# Check MCP binary is built
MCP_BINARY="$AGENT_CHAT_DIR/packages/mcp/dist/index.js"
if [ ! -f "$MCP_BINARY" ]; then
  echo "Error: AgentChat is not built. The MCP server binary is missing."
  echo ""
  echo "Build it first:"
  echo "  cd $AGENT_CHAT_DIR && pnpm install && pnpm build"
  exit 1
fi

# Check target directory exists
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Target directory not found: $TARGET_DIR"
  exit 1
fi

# Warn if target is the AgentChat directory itself
if [ "$TARGET_DIR" = "$AGENT_CHAT_DIR" ]; then
  echo "Note: Setting up AgentChat to connect to itself. This is fine for testing."
fi

# ---------------------------------------------------------------------------
# Create .claude directory and merge settings
# ---------------------------------------------------------------------------

SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"
mkdir -p "$TARGET_DIR/.claude"

node "$AGENT_CHAT_DIR/scripts/lib/merge-settings.cjs" \
  --mode=setup \
  --target="$SETTINGS_FILE" \
  --agent-chat-dir="$AGENT_CHAT_DIR" \
  --project-dir="$TARGET_DIR"

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------

cat <<SUMMARY

AgentChat configured for: $TARGET_DIR

Settings written to: $SETTINGS_FILE
  - Hooks: SessionStart, SessionEnd, PreToolUse, PostToolUse
  - MCP Server: agent-chat (7 tools: send_message, read_channel, list_channels, create_document, read_document, update_document, list_documents)
  - Team Watching: Agent team conversations from ~/.claude/teams/ are automatically visible in the web UI

Next steps:

  1. Start the AgentChat server:
     cd $AGENT_CHAT_DIR && pnpm dev

  2. Open the web UI:
     http://localhost:5173

  3. Open Claude Code in your project:
     cd $TARGET_DIR && claude

  4. Your agent's messages will appear in the AgentChat web UI!

To verify the server is running:
  curl http://localhost:5555/health

Team conversations:
  Agent team messages from ~/.claude/teams/ are automatically
  ingested into AgentChat when the server is running.
  Override the teams directory: TEAMS_DIR=/path/to/teams

To remove AgentChat from this project:
  $AGENT_CHAT_DIR/scripts/teardown.sh $TARGET_DIR

SUMMARY
