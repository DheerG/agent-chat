#!/usr/bin/env bash
# test-setup.sh — Integration tests for setup.sh, teardown.sh, and bin/cli.js
# Usage: ./scripts/test-setup.sh
#
# Runs 12 test cases validating setup, teardown, CLI install/uninstall,
# idempotency, and merge behavior. Uses temporary directories and cleans up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP="$AGENT_CHAT_DIR/scripts/setup.sh"
TEARDOWN="$AGENT_CHAT_DIR/scripts/teardown.sh"
MERGE="$AGENT_CHAT_DIR/scripts/lib/merge-settings.cjs"
CLI="$AGENT_CHAT_DIR/bin/cli.js"

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
# CLI tests (bin/cli.js)
# ---------------------------------------------------------------------------

# Test 7: CLI project install creates split files
test_cli_project_install() {
  local dir
  dir=$(create_temp_dir)

  node "$CLI" install --project "$dir" >/dev/null 2>&1

  local hooks_file="$dir/.claude/settings.json"
  local mcp_file="$dir/.mcp.json"

  # Check hooks file exists with hooks but NO mcpServers
  if [ ! -f "$hooks_file" ]; then
    fail "CLI project install" "hooks file not created"
    cleanup_temp_dir "$dir"
    return
  fi

  if ! json_check "$hooks_file" "
    j.hooks &&
    j.hooks.SessionStart && j.hooks.SessionStart.length === 1 &&
    j.hooks.SessionEnd && j.hooks.SessionEnd.length === 1 &&
    j.hooks.PreToolUse && j.hooks.PreToolUse.length === 1 &&
    j.hooks.PostToolUse && j.hooks.PostToolUse.length === 1 &&
    !j.mcpServers
  "; then
    fail "CLI project install" "hooks file has wrong structure"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check MCP file exists with mcpServers and AGENT_CHAT_CWD
  if [ ! -f "$mcp_file" ]; then
    fail "CLI project install" "MCP file not created"
    cleanup_temp_dir "$dir"
    return
  fi

  if json_check "$mcp_file" "
    j.mcpServers &&
    j.mcpServers['agent-chat'] &&
    j.mcpServers['agent-chat'].command === 'node' &&
    j.mcpServers['agent-chat'].env.AGENT_CHAT_CWD === '$dir'
  "; then
    pass "CLI project install"
  else
    fail "CLI project install" "MCP file has wrong structure or missing AGENT_CHAT_CWD"
  fi

  cleanup_temp_dir "$dir"
}

# Test 8: CLI project install is idempotent
test_cli_idempotent() {
  local dir
  dir=$(create_temp_dir)

  node "$CLI" install --project "$dir" >/dev/null 2>&1
  local hooks1 mcp1
  hooks1=$(cat "$dir/.claude/settings.json")
  mcp1=$(cat "$dir/.mcp.json")

  node "$CLI" install --project "$dir" >/dev/null 2>&1
  local hooks2 mcp2
  hooks2=$(cat "$dir/.claude/settings.json")
  mcp2=$(cat "$dir/.mcp.json")

  if [ "$hooks1" = "$hooks2" ] && [ "$mcp1" = "$mcp2" ]; then
    pass "CLI idempotent install"
  else
    fail "CLI idempotent install" "Second run changed the output"
  fi

  cleanup_temp_dir "$dir"
}

# Test 9: CLI project uninstall removes only AgentChat
test_cli_uninstall_selective() {
  local dir
  dir=$(create_temp_dir)
  mkdir -p "$dir/.claude"

  # Create existing hooks
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
    ]
  }
}
EXISTING

  # Install AgentChat via CLI
  node "$CLI" install --project "$dir" >/dev/null 2>&1

  # Add another MCP server to .mcp.json
  node -e "
    const fs = require('fs');
    const mcp = JSON.parse(fs.readFileSync('$dir/.mcp.json', 'utf8'));
    mcp.mcpServers['other-server'] = { command: 'test', args: [] };
    fs.writeFileSync('$dir/.mcp.json', JSON.stringify(mcp, null, 2) + '\n');
  "

  # Uninstall
  node "$CLI" uninstall --project "$dir" >/dev/null 2>&1

  local hooks_file="$dir/.claude/settings.json"
  local mcp_file="$dir/.mcp.json"

  # Check existing hook preserved in settings.json
  if ! json_check "$hooks_file" "
    j.hooks &&
    j.hooks.SessionStart &&
    j.hooks.SessionStart.length === 1 &&
    j.hooks.SessionStart[0].hooks[0].command === 'echo my-existing-hook' &&
    !j.hooks.SessionEnd &&
    !j.hooks.PreToolUse &&
    !j.hooks.PostToolUse
  "; then
    fail "CLI uninstall selective" "Hooks not correctly cleaned"
    cleanup_temp_dir "$dir"
    return
  fi

  # Check other MCP server preserved in .mcp.json
  if json_check "$mcp_file" "
    j.mcpServers['other-server'] &&
    j.mcpServers['other-server'].command === 'test' &&
    !j.mcpServers['agent-chat']
  "; then
    pass "CLI uninstall selective"
  else
    fail "CLI uninstall selective" "MCP servers not correctly cleaned"
  fi

  cleanup_temp_dir "$dir"
}

# Test 10: CLI global install writes to correct files
test_cli_global_install() {
  local mock_home
  mock_home=$(create_temp_dir)

  HOME=$mock_home node "$CLI" install --global >/dev/null 2>&1

  local hooks_file="$mock_home/.claude/settings.json"
  local mcp_file="$mock_home/.claude/.mcp.json"

  # Check hooks file has hooks but NO mcpServers
  if ! json_check "$hooks_file" "
    j.hooks &&
    j.hooks.SessionStart && j.hooks.SessionStart.length === 1 &&
    !j.mcpServers
  "; then
    fail "CLI global install" "hooks file has wrong structure"
    cleanup_temp_dir "$mock_home"
    return
  fi

  # Check MCP file has mcpServers but NO AGENT_CHAT_CWD
  if json_check "$mcp_file" "
    j.mcpServers &&
    j.mcpServers['agent-chat'] &&
    j.mcpServers['agent-chat'].command === 'node' &&
    !('AGENT_CHAT_CWD' in j.mcpServers['agent-chat'].env)
  "; then
    pass "CLI global install"
  else
    fail "CLI global install" "MCP file wrong or has AGENT_CHAT_CWD"
  fi

  cleanup_temp_dir "$mock_home"
}

# Test 11: CLI global uninstall
test_cli_global_uninstall() {
  local mock_home
  mock_home=$(create_temp_dir)

  HOME=$mock_home node "$CLI" install --global >/dev/null 2>&1
  HOME=$mock_home node "$CLI" uninstall --global >/dev/null 2>&1

  local hooks_file="$mock_home/.claude/settings.json"
  local mcp_file="$mock_home/.claude/.mcp.json"

  # Both files should be removed (they had only AgentChat entries)
  if [ ! -f "$hooks_file" ] && [ ! -f "$mcp_file" ]; then
    pass "CLI global uninstall"
  else
    fail "CLI global uninstall" "Files not cleaned up"
  fi

  cleanup_temp_dir "$mock_home"
}

# Test 12: CLI --help exits 0
test_cli_help() {
  local output
  output=$(node "$CLI" --help 2>&1)
  local exit_code=$?

  if [ $exit_code -eq 0 ] && echo "$output" | grep -q "install" && echo "$output" | grep -q "uninstall"; then
    pass "CLI --help"
  else
    fail "CLI --help" "Exit code $exit_code or missing commands in output"
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
test_cli_project_install
test_cli_idempotent
test_cli_uninstall_selective
test_cli_global_install
test_cli_global_uninstall
test_cli_help

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
