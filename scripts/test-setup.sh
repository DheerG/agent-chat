#!/usr/bin/env bash
# test-setup.sh — Integration tests for setup.sh and teardown.sh
# Usage: ./scripts/test-setup.sh
#
# Runs 6 test cases validating setup, teardown, idempotency,
# and merge behavior. Uses temporary directories and cleans up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP="$AGENT_CHAT_DIR/scripts/setup.sh"
TEARDOWN="$AGENT_CHAT_DIR/scripts/teardown.sh"
MERGE="$AGENT_CHAT_DIR/scripts/lib/merge-settings.cjs"

PASSED=0
FAILED=0
TOTAL=0

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

create_temp_dir() {
  local dir
  dir=$(mktemp -d "${TMPDIR:-/tmp}/agent-chat-test-XXXXXX")
  # Normalize path (resolve symlinks, double slashes) via cd+pwd
  dir=$(cd "$dir" && pwd)
  echo "$dir"
}

cleanup_temp_dir() {
  rm -rf "$1"
}

pass() {
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))
  printf "  PASS: %s\n" "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
  printf "  FAIL: %s — %s\n" "$1" "$2"
}

# Check JSON field using node
json_check() {
  local file="$1"
  local expr="$2"
  node -e "
    const j = JSON.parse(require('fs').readFileSync('$file', 'utf8'));
    const result = $expr;
    process.exit(result ? 0 : 1);
  " 2>/dev/null
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo ""
echo "AgentChat Setup Integration Tests"
echo "=================================="

# Test 1: Fresh setup
test_fresh_setup() {
  local dir
  dir=$(create_temp_dir)

  bash "$SETUP" "$dir" >/dev/null 2>&1

  local settings="$dir/.claude/settings.json"
  if [ ! -f "$settings" ]; then
    fail "Fresh setup" "settings.json not created"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check hooks exist for all 4 event types
  if json_check "$settings" "
    j.hooks &&
    j.hooks.SessionStart && j.hooks.SessionStart.length === 1 &&
    j.hooks.SessionEnd && j.hooks.SessionEnd.length === 1 &&
    j.hooks.PreToolUse && j.hooks.PreToolUse.length === 1 &&
    j.hooks.PostToolUse && j.hooks.PostToolUse.length === 1
  "; then
    : # hooks ok
  else
    fail "Fresh setup" "Missing hook events"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check MCP server
  if json_check "$settings" "
    j.mcpServers &&
    j.mcpServers['agent-chat'] &&
    j.mcpServers['agent-chat'].command === 'node' &&
    j.mcpServers['agent-chat'].args[0].includes('packages/mcp/dist/index.js')
  "; then
    : # mcp ok
  else
    fail "Fresh setup" "Missing or invalid MCP server entry"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check env vars
  if json_check "$settings" "
    j.mcpServers['agent-chat'].env.AGENT_CHAT_DB_PATH.includes('.agent-chat/data.db') &&
    j.mcpServers['agent-chat'].env.AGENT_CHAT_TENANT_ID === 'auto' &&
    j.mcpServers['agent-chat'].env.AGENT_CHAT_CWD === '$dir'
  "; then
    pass "Fresh setup"
  else
    fail "Fresh setup" "Invalid MCP environment variables"
  fi

  cleanup_temp_dir "$dir"
}

# Test 2: Idempotent setup
test_idempotent_setup() {
  local dir
  dir=$(create_temp_dir)

  bash "$SETUP" "$dir" >/dev/null 2>&1
  local first
  first=$(cat "$dir/.claude/settings.json")

  bash "$SETUP" "$dir" >/dev/null 2>&1
  local second
  second=$(cat "$dir/.claude/settings.json")

  if [ "$first" = "$second" ]; then
    pass "Idempotent setup"
  else
    fail "Idempotent setup" "Second run changed the output"
  fi

  cleanup_temp_dir "$dir"
}

# Test 3: Merge with existing settings
test_merge_existing() {
  local dir
  dir=$(create_temp_dir)
  mkdir -p "$dir/.claude"

  # Create existing settings with hooks and MCP servers
  cat > "$dir/.claude/settings.json" <<'EXISTING'
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo my-existing-hook"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo lint-check"
          }
        ]
      }
    ]
  },
  "mcpServers": {
    "memory-server": {
      "command": "node",
      "args": ["memory.js"]
    }
  },
  "statusLine": {
    "type": "command",
    "command": "echo status"
  }
}
EXISTING

  bash "$SETUP" "$dir" >/dev/null 2>&1

  local settings="$dir/.claude/settings.json"

  # Check existing hook preserved
  if ! json_check "$settings" "
    j.hooks.SessionStart.length === 2 &&
    j.hooks.SessionStart[0].hooks[0].command === 'echo my-existing-hook'
  "; then
    fail "Merge with existing" "Existing SessionStart hook was lost"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check existing PostToolUse hook preserved alongside new one
  if ! json_check "$settings" "
    j.hooks.PostToolUse.length === 2 &&
    j.hooks.PostToolUse[0].matcher === 'Write'
  "; then
    fail "Merge with existing" "Existing PostToolUse hook was lost"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check existing MCP server preserved
  if ! json_check "$settings" "
    j.mcpServers['memory-server'] &&
    j.mcpServers['memory-server'].command === 'node' &&
    j.mcpServers['agent-chat']
  "; then
    fail "Merge with existing" "Existing MCP server was lost"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check statusLine preserved
  if json_check "$settings" "j.statusLine && j.statusLine.command === 'echo status'"; then
    pass "Merge with existing"
  else
    fail "Merge with existing" "statusLine was lost"
  fi

  cleanup_temp_dir "$dir"
}

# Test 4: Teardown removes only AgentChat
test_teardown_selective() {
  local dir
  dir=$(create_temp_dir)
  mkdir -p "$dir/.claude"

  # Create settings with existing + AgentChat entries
  cat > "$dir/.claude/settings.json" <<'EXISTING'
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo my-hook"
          }
        ]
      }
    ]
  },
  "mcpServers": {
    "other-server": {
      "command": "test"
    }
  },
  "statusLine": {
    "type": "command",
    "command": "echo status"
  }
}
EXISTING

  # Setup adds AgentChat
  bash "$SETUP" "$dir" >/dev/null 2>&1

  # Teardown removes AgentChat
  bash "$TEARDOWN" "$dir" >/dev/null 2>&1

  local settings="$dir/.claude/settings.json"

  # Existing hook should remain
  if ! json_check "$settings" "
    j.hooks &&
    j.hooks.SessionStart &&
    j.hooks.SessionStart.length === 1 &&
    j.hooks.SessionStart[0].hooks[0].command === 'echo my-hook'
  "; then
    fail "Teardown selective" "Existing hook was removed"
    cleanup_temp_dir "$dir"
    return
  fi

  # AgentChat hooks should be gone (no SessionEnd, PreToolUse, PostToolUse)
  if ! json_check "$settings" "
    !j.hooks.SessionEnd &&
    !j.hooks.PreToolUse &&
    !j.hooks.PostToolUse
  "; then
    fail "Teardown selective" "AgentChat hooks still present"
    cleanup_temp_dir "$dir"
    return
  fi

  # Other MCP server should remain, agent-chat should be gone
  if ! json_check "$settings" "
    j.mcpServers['other-server'] &&
    !j.mcpServers['agent-chat']
  "; then
    fail "Teardown selective" "MCP servers incorrect after teardown"
    cleanup_temp_dir "$dir"
    return
  fi

  # statusLine should remain
  if json_check "$settings" "j.statusLine && j.statusLine.command === 'echo status'"; then
    pass "Teardown selective"
  else
    fail "Teardown selective" "statusLine was removed"
  fi

  cleanup_temp_dir "$dir"
}

# Test 5: Teardown on clean project (no settings)
test_teardown_clean() {
  local dir
  dir=$(create_temp_dir)

  # No .claude/settings.json exists
  local output
  output=$(bash "$TEARDOWN" "$dir" 2>&1)
  local exit_code=$?

  if [ $exit_code -eq 0 ] && echo "$output" | grep -q "nothing to remove"; then
    pass "Teardown on clean project"
  else
    fail "Teardown on clean project" "Did not exit cleanly (code=$exit_code)"
  fi

  cleanup_temp_dir "$dir"
}

# Test 6: merge-settings.cjs self-test
test_merge_self_test() {
  local output
  output=$(node "$MERGE" --test 2>&1)
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    pass "merge-settings self-test"
  else
    fail "merge-settings self-test" "Self-test exited with code $exit_code"
  fi
}

# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

test_fresh_setup
test_idempotent_setup
test_merge_existing
test_teardown_selective
test_teardown_clean
test_merge_self_test

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "$PASSED/$TOTAL tests passed"
echo ""

if [ $FAILED -gt 0 ]; then
  exit 1
fi
exit 0
