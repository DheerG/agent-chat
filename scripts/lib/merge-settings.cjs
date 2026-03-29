#!/usr/bin/env node
// merge-settings.cjs — Merge AgentChat hooks and MCP server config into Claude Code settings.json
// Usage:
//   node merge-settings.cjs --mode=setup --target=path/to/settings.json --agent-chat-dir=/path --project-dir=/path
//   node merge-settings.cjs --mode=teardown --target=path/to/settings.json
//   node merge-settings.cjs --test

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--test') {
      args.test = true;
    } else if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      args[key] = rest.join('=') || true;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// AgentChat configuration builders
// ---------------------------------------------------------------------------

const AGENT_CHAT_MARKER = 'localhost:5555/api/';
const AGENT_CHAT_MCP_KEY = 'agent-chat';
const PORT = 5555;

function buildHookCommand(eventType) {
  return `curl -s -X POST http://localhost:${PORT}/api/events/${eventType} -H 'Content-Type: application/json' -d "$(cat)" 2>/dev/null || true`;
}

function buildHookEntry(eventType) {
  const matcher = (eventType === 'PreToolUse' || eventType === 'PostToolUse') ? '*' : '';
  return {
    matcher,
    hooks: [
      {
        type: 'command',
        command: buildHookCommand(eventType),
      },
    ],
  };
}

function buildMcpEntry(agentChatDir, projectDir) {
  const dbPath = path.join(os.homedir(), '.agent-chat', 'data.db');
  return {
    command: 'node',
    args: [path.join(agentChatDir, 'packages', 'mcp', 'dist', 'index.js')],
    env: {
      AGENT_CHAT_DB_PATH: dbPath,
      AGENT_CHAT_SESSION_ID: 'auto',
      AGENT_CHAT_AGENT_NAME: 'claude-agent',
    },
  };
}

function buildMcpEntryGlobal(agentChatDir) {
  const dbPath = path.join(os.homedir(), '.agent-chat', 'data.db');
  return {
    command: 'node',
    args: [path.join(agentChatDir, 'packages', 'mcp', 'dist', 'index.js')],
    env: {
      AGENT_CHAT_DB_PATH: dbPath,
      AGENT_CHAT_SESSION_ID: 'auto',
      AGENT_CHAT_AGENT_NAME: 'claude-agent',
    },
  };
}

const HOOK_EVENTS = [
  'SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse',
  'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Notification',
];

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

function hasAgentChatHook(hookGroups) {
  if (!Array.isArray(hookGroups)) return false;
  return hookGroups.some((group) => {
    if (!group || !Array.isArray(group.hooks)) return false;
    return group.hooks.some(
      (h) => typeof h.command === 'string' && h.command.includes(AGENT_CHAT_MARKER)
    );
  });
}

function mergeSetup(settings, agentChatDir, projectDir) {
  // Deep clone to avoid mutation
  const result = JSON.parse(JSON.stringify(settings));

  // Merge hooks
  if (!result.hooks) result.hooks = {};
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(result.hooks[event])) {
      result.hooks[event] = [];
    }
    if (!hasAgentChatHook(result.hooks[event])) {
      result.hooks[event].push(buildHookEntry(event));
    }
  }

  // Merge mcpServers
  if (!result.mcpServers) result.mcpServers = {};
  result.mcpServers[AGENT_CHAT_MCP_KEY] = buildMcpEntry(agentChatDir, projectDir);

  return result;
}

function mergeTeardown(settings) {
  const result = JSON.parse(JSON.stringify(settings));

  // Remove AgentChat hooks
  if (result.hooks) {
    for (const event of Object.keys(result.hooks)) {
      if (Array.isArray(result.hooks[event])) {
        result.hooks[event] = result.hooks[event].filter((group) => {
          if (!group || !Array.isArray(group.hooks)) return true;
          return !group.hooks.some(
            (h) => typeof h.command === 'string' && h.command.includes(AGENT_CHAT_MARKER)
          );
        });
        // Remove empty arrays
        if (result.hooks[event].length === 0) {
          delete result.hooks[event];
        }
      }
    }
    // Remove empty hooks object
    if (Object.keys(result.hooks).length === 0) {
      delete result.hooks;
    }
  }

  // Remove AgentChat MCP server
  if (result.mcpServers) {
    delete result.mcpServers[AGENT_CHAT_MCP_KEY];
    if (Object.keys(result.mcpServers).length === 0) {
      delete result.mcpServers;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Split merge/teardown functions (for CLI split-file mode)
// ---------------------------------------------------------------------------

function mergeHooksOnly(settings) {
  const result = JSON.parse(JSON.stringify(settings));
  if (!result.hooks) result.hooks = {};
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(result.hooks[event])) {
      result.hooks[event] = [];
    }
    if (!hasAgentChatHook(result.hooks[event])) {
      result.hooks[event].push(buildHookEntry(event));
    }
  }
  return result;
}

function mergeMcpOnly(settings, mcpEntry) {
  const result = JSON.parse(JSON.stringify(settings));
  if (!result.mcpServers) result.mcpServers = {};
  result.mcpServers[AGENT_CHAT_MCP_KEY] = mcpEntry;
  return result;
}

function teardownHooksOnly(settings) {
  const result = JSON.parse(JSON.stringify(settings));
  if (result.hooks) {
    for (const event of Object.keys(result.hooks)) {
      if (Array.isArray(result.hooks[event])) {
        result.hooks[event] = result.hooks[event].filter((group) => {
          if (!group || !Array.isArray(group.hooks)) return true;
          return !group.hooks.some(
            (h) => typeof h.command === 'string' && h.command.includes(AGENT_CHAT_MARKER)
          );
        });
        if (result.hooks[event].length === 0) delete result.hooks[event];
      }
    }
    if (Object.keys(result.hooks).length === 0) delete result.hooks;
  }
  return result;
}

function teardownMcpOnly(settings) {
  const result = JSON.parse(JSON.stringify(settings));
  if (result.mcpServers) {
    delete result.mcpServers[AGENT_CHAT_MCP_KEY];
    if (Object.keys(result.mcpServers).length === 0) delete result.mcpServers;
  }
  return result;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function readSettingsFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function writeSettingsFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Self-test suite
// ---------------------------------------------------------------------------

function runTests() {
  let passed = 0;
  let failed = 0;
  const results = [];

  function assert(name, condition, detail) {
    if (condition) {
      passed++;
      results.push({ name, status: 'PASS' });
    } else {
      failed++;
      results.push({ name, status: 'FAIL', detail });
    }
  }

  const testDir = '/test/agent-chat';
  const testProject = '/test/my-project';

  // Test 1: Setup on empty creates correct structure
  {
    const result = mergeSetup({}, testDir, testProject);
    assert(
      'Setup on empty creates hooks',
      result.hooks && HOOK_EVENTS.every((e) => Array.isArray(result.hooks[e]) && result.hooks[e].length === 1),
      'Missing hook events: ' + JSON.stringify(Object.keys(result.hooks || {}))
    );
    assert(
      'Setup on empty creates mcpServers',
      result.mcpServers && result.mcpServers[AGENT_CHAT_MCP_KEY] &&
        result.mcpServers[AGENT_CHAT_MCP_KEY].command === 'node',
      'Missing or invalid mcpServers'
    );
  }

  // Test 2: Setup preserves existing hooks
  {
    const existing = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: 'command', command: 'echo existing-hook' }],
          },
        ],
      },
    };
    const result = mergeSetup(existing, testDir, testProject);
    assert(
      'Setup preserves existing hooks',
      result.hooks.SessionStart.length === 2 &&
        result.hooks.SessionStart[0].hooks[0].command === 'echo existing-hook',
      'Existing hook was removed or modified'
    );
  }

  // Test 3: Setup preserves existing mcpServers
  {
    const existing = {
      mcpServers: {
        'other-server': { command: 'test', args: [] },
      },
    };
    const result = mergeSetup(existing, testDir, testProject);
    assert(
      'Setup preserves existing mcpServers',
      result.mcpServers['other-server'] &&
        result.mcpServers['other-server'].command === 'test' &&
        result.mcpServers[AGENT_CHAT_MCP_KEY],
      'Existing MCP server was removed'
    );
  }

  // Test 4: Idempotent — running twice produces same result
  {
    const first = mergeSetup({}, testDir, testProject);
    const second = mergeSetup(first, testDir, testProject);
    assert(
      'Setup is idempotent',
      JSON.stringify(first) === JSON.stringify(second),
      'Second run changed the output'
    );
  }

  // Test 5: Teardown removes only AgentChat entries
  {
    const existing = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'echo existing-hook' }] },
        ],
      },
      mcpServers: {
        'other-server': { command: 'test', args: [] },
      },
    };
    const withAgentChat = mergeSetup(existing, testDir, testProject);
    const tornDown = mergeTeardown(withAgentChat);
    assert(
      'Teardown removes AgentChat hooks',
      tornDown.hooks &&
        tornDown.hooks.SessionStart &&
        tornDown.hooks.SessionStart.length === 1 &&
        tornDown.hooks.SessionStart[0].hooks[0].command === 'echo existing-hook',
      'Teardown removed existing hooks or kept AgentChat hooks'
    );
    assert(
      'Teardown removes AgentChat MCP only',
      tornDown.mcpServers &&
        tornDown.mcpServers['other-server'] &&
        !tornDown.mcpServers[AGENT_CHAT_MCP_KEY],
      'Teardown removed other MCP servers or kept AgentChat'
    );
  }

  // Test 6: Teardown preserves other entries
  {
    const onlyOther = {
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo lint' }] },
        ],
      },
      mcpServers: {
        memory: { command: 'node', args: ['memory-server'] },
      },
      statusLine: { type: 'command', command: 'echo status' },
    };
    const tornDown = mergeTeardown(onlyOther);
    assert(
      'Teardown preserves non-AgentChat entries',
      tornDown.hooks &&
        tornDown.hooks.PreToolUse &&
        tornDown.hooks.PreToolUse.length === 1 &&
        tornDown.mcpServers &&
        tornDown.mcpServers.memory &&
        tornDown.statusLine,
      'Teardown removed non-AgentChat entries'
    );
  }

  // Test 7: mergeHooksOnly adds hooks but no mcpServers
  {
    const result = mergeHooksOnly({});
    assert(
      'mergeHooksOnly adds hooks only',
      result.hooks &&
        HOOK_EVENTS.every((e) => Array.isArray(result.hooks[e]) && result.hooks[e].length === 1) &&
        !result.mcpServers,
      'mergeHooksOnly created mcpServers or missing hooks'
    );
  }

  // Test 8: mergeMcpOnly adds MCP but no hooks
  {
    const mcpEntry = buildMcpEntry(testDir, testProject);
    const result = mergeMcpOnly({}, mcpEntry);
    assert(
      'mergeMcpOnly adds MCP only',
      result.mcpServers &&
        result.mcpServers[AGENT_CHAT_MCP_KEY] &&
        result.mcpServers[AGENT_CHAT_MCP_KEY].command === 'node' &&
        !result.hooks,
      'mergeMcpOnly created hooks or missing MCP'
    );
  }

  // Test 9: buildMcpEntryGlobal does NOT include AGENT_CHAT_CWD
  {
    const entry = buildMcpEntryGlobal(testDir);
    assert(
      'buildMcpEntryGlobal omits AGENT_CHAT_CWD',
      entry.command === 'node' &&
        entry.env &&
        entry.env.AGENT_CHAT_DB_PATH &&
        entry.env.AGENT_CHAT_SESSION_ID === 'auto' &&
        !('AGENT_CHAT_CWD' in entry.env),
      'buildMcpEntryGlobal includes AGENT_CHAT_CWD or missing fields'
    );
  }

  // Test 10: teardownHooksOnly removes hooks but not MCP
  {
    const withBoth = mergeSetup({}, testDir, testProject);
    const result = teardownHooksOnly(withBoth);
    assert(
      'teardownHooksOnly removes hooks only',
      !result.hooks &&
        result.mcpServers &&
        result.mcpServers[AGENT_CHAT_MCP_KEY],
      'teardownHooksOnly removed MCP or kept hooks'
    );
  }

  // Test 11: teardownMcpOnly removes MCP but not hooks
  {
    const withBoth = mergeSetup({}, testDir, testProject);
    const result = teardownMcpOnly(withBoth);
    assert(
      'teardownMcpOnly removes MCP only',
      result.hooks &&
        HOOK_EVENTS.every((e) => Array.isArray(result.hooks[e]) && result.hooks[e].length === 1) &&
        !result.mcpServers,
      'teardownMcpOnly removed hooks or kept MCP'
    );
  }

  // Print results
  console.log('');
  console.log('merge-settings.cjs Self-Tests');
  console.log('=============================');
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`  ${icon}: ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log('');
  console.log(`${passed}/${passed + failed} tests passed`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Exports (for use by bin/cli.js)
// ---------------------------------------------------------------------------

module.exports = {
  mergeSetup,
  mergeTeardown,
  mergeHooksOnly,
  mergeMcpOnly,
  teardownHooksOnly,
  teardownMcpOnly,
  readSettingsFile,
  writeSettingsFile,
  buildHookEntry,
  buildMcpEntry,
  buildMcpEntryGlobal,
  hasAgentChatHook,
  HOOK_EVENTS,
  AGENT_CHAT_MARKER,
  AGENT_CHAT_MCP_KEY,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  if (args.test) {
    runTests();
    return;
  }

  const mode = args.mode;
  const targetPath = args.target;

  if (!mode || !targetPath) {
    console.error('Usage: node merge-settings.cjs --mode=setup|teardown --target=<path> [--agent-chat-dir=<path>] [--project-dir=<path>]');
    process.exit(1);
  }

  const settings = readSettingsFile(targetPath);

  if (mode === 'setup') {
    const agentChatDir = args['agent-chat-dir'];
    const projectDir = args['project-dir'];
    if (!agentChatDir || !projectDir) {
      console.error('Error: --agent-chat-dir and --project-dir are required for setup mode');
      process.exit(1);
    }
    const merged = mergeSetup(settings, agentChatDir, projectDir);
    writeSettingsFile(targetPath, merged);
  } else if (mode === 'teardown') {
    const tornDown = mergeTeardown(settings);
    // If nothing left, check if we should keep the file
    if (Object.keys(tornDown).length === 0) {
      // Remove the file only if it would be completely empty
      try {
        fs.unlinkSync(targetPath);
      } catch {
        // File didn't exist — that's fine
      }
    } else {
      writeSettingsFile(targetPath, tornDown);
    }
  } else {
    console.error(`Error: Unknown mode "${mode}". Use "setup" or "teardown".`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
