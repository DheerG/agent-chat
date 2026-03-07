#!/usr/bin/env bash
# teardown.sh — Remove AgentChat configuration from a local codebase
# Usage: ./scripts/teardown.sh [TARGET_PROJECT_PATH]
#
# This script removes AgentChat hooks and MCP server entries from
# the target project's .claude/settings.json. Other hooks and MCP
# servers are preserved.

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
# Check if settings exist
# ---------------------------------------------------------------------------

SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "No .claude/settings.json found in $TARGET_DIR — nothing to remove."
  exit 0
fi

# Check if AgentChat config exists in the file
if ! grep -q "localhost:5555/api/hooks\|\"agent-chat\"" "$SETTINGS_FILE" 2>/dev/null; then
  echo "No AgentChat configuration found in $SETTINGS_FILE — nothing to remove."
  exit 0
fi

# ---------------------------------------------------------------------------
# Run teardown
# ---------------------------------------------------------------------------

node "$AGENT_CHAT_DIR/scripts/lib/merge-settings.cjs" \
  --mode=teardown \
  --target="$SETTINGS_FILE"

# ---------------------------------------------------------------------------
# Print result
# ---------------------------------------------------------------------------

if [ -f "$SETTINGS_FILE" ]; then
  cat <<RESULT

AgentChat configuration removed from: $TARGET_DIR

Removed:
  - Hooks: SessionStart, SessionEnd, PreToolUse, PostToolUse (AgentChat entries only)
  - MCP Server: agent-chat

Other Claude Code settings have been preserved.

RESULT
else
  cat <<RESULT

AgentChat configuration removed from: $TARGET_DIR

Removed:
  - Hooks: SessionStart, SessionEnd, PreToolUse, PostToolUse (AgentChat entries only)
  - MCP Server: agent-chat

Settings file was removed (no other configuration remained).

RESULT
fi
