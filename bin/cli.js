#!/usr/bin/env node
// cli.js — npx agent-chat install/uninstall CLI
// Usage:
//   npx agent-chat install [--global | --project <path>]
//   npx agent-chat uninstall [--global | --project <path>]

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  mergeHooksOnly,
  mergeMcpOnly,
  teardownHooksOnly,
  teardownMcpOnly,
  readSettingsFile,
  writeSettingsFile,
  buildMcpEntry,
  buildMcpEntryGlobal,
  AGENT_CHAT_MCP_KEY,
  AGENT_CHAT_MARKER,
} = require('../scripts/lib/merge-settings.cjs');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const result = { command: null, global: false, project: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'install' || arg === 'uninstall') {
      result.command = arg;
    } else if (arg === '--global' || arg === '-g') {
      result.global = true;
    } else if (arg === '--project' || arg === '-p') {
      result.project = args[++i] || null;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
Usage: npx agent-chat <command> [options]

Commands:
  install     Configure Claude Code hooks and MCP server for AgentChat
  uninstall   Remove AgentChat configuration

Options:
  --global, -g           Install/uninstall globally (~/.claude/)
  --project, -p <path>   Install/uninstall for a specific project
  --help, -h             Show this help message

Examples:
  npx agent-chat install --global
  npx agent-chat install --project /path/to/project
  npx agent-chat install                  (current directory)
  npx agent-chat uninstall --global
  npx agent-chat uninstall
`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAgentChatDir() {
  return path.resolve(__dirname, '..');
}

function validateMcpBinary(agentChatDir) {
  const mcpBinary = path.join(agentChatDir, 'packages', 'mcp', 'dist', 'index.js');
  if (!fs.existsSync(mcpBinary)) {
    console.error('Error: AgentChat is not built. The MCP server binary is missing.');
    console.error('');
    console.error('Build it first:');
    console.error(`  cd ${agentChatDir} && pnpm install && pnpm build`);
    process.exit(1);
  }
  return mcpBinary;
}

function writeOrDelete(filePath, data) {
  if (Object.keys(data).length === 0) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File didn't exist — that's fine
    }
  } else {
    writeSettingsFile(filePath, data);
  }
}

function hasAgentChatConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes(AGENT_CHAT_MARKER) || content.includes(`"${AGENT_CHAT_MCP_KEY}"`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installGlobal(agentChatDir) {
  const hooksFile = path.join(os.homedir(), '.claude', 'settings.json');
  const mcpFile = path.join(os.homedir(), '.claude', '.mcp.json');

  // Create ~/.claude/ if it doesn't exist
  fs.mkdirSync(path.dirname(hooksFile), { recursive: true });

  // Merge hooks into settings.json
  const hooksSettings = readSettingsFile(hooksFile);
  const mergedHooks = mergeHooksOnly(hooksSettings);
  writeSettingsFile(hooksFile, mergedHooks);

  // Merge MCP into .mcp.json
  const mcpSettings = readSettingsFile(mcpFile);
  const mcpEntry = buildMcpEntryGlobal(agentChatDir);
  const mergedMcp = mergeMcpOnly(mcpSettings, mcpEntry);
  writeSettingsFile(mcpFile, mergedMcp);

  console.log(`
AgentChat configured globally

Hooks written to: ${hooksFile}
  - SessionStart, SessionEnd, PreToolUse, PostToolUse

MCP server written to: ${mcpFile}
  - agent-chat (sends messages, reads channels, manages documents)

Next steps:

  1. Start the AgentChat server:
     cd ${agentChatDir} && pnpm dev

  2. Open the web UI:
     http://localhost:5173

  3. Start Claude Code in any project:
     claude

  4. Your agent's messages will appear in the AgentChat web UI!

To verify the server is running:
  curl http://localhost:5555/health

To remove this configuration:
  npx agent-chat uninstall --global
`);
}

function installProject(agentChatDir, projectDir) {
  // Resolve to absolute path
  projectDir = path.resolve(projectDir);

  // Validate project directory exists — create if it doesn't
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const hooksFile = path.join(projectDir, '.claude', 'settings.json');
  const mcpFile = path.join(projectDir, '.mcp.json');

  // Create <project>/.claude/ if needed
  fs.mkdirSync(path.dirname(hooksFile), { recursive: true });

  // Merge hooks into settings.json
  const hooksSettings = readSettingsFile(hooksFile);
  const mergedHooks = mergeHooksOnly(hooksSettings);
  writeSettingsFile(hooksFile, mergedHooks);

  // Merge MCP into .mcp.json
  const mcpSettings = readSettingsFile(mcpFile);
  const mcpEntry = buildMcpEntry(agentChatDir, projectDir);
  const mergedMcp = mergeMcpOnly(mcpSettings, mcpEntry);
  writeSettingsFile(mcpFile, mergedMcp);

  console.log(`
AgentChat configured for: ${projectDir}

Hooks written to: ${hooksFile}
  - SessionStart, SessionEnd, PreToolUse, PostToolUse

MCP server written to: ${mcpFile}
  - agent-chat (sends messages, reads channels, manages documents)

Next steps:

  1. Start the AgentChat server:
     cd ${agentChatDir} && pnpm dev

  2. Open the web UI:
     http://localhost:5173

  3. Start Claude Code in your project:
     cd ${projectDir} && claude

  4. Your agent's messages will appear in the AgentChat web UI!

To verify the server is running:
  curl http://localhost:5555/health

To remove this configuration:
  npx agent-chat uninstall --project ${projectDir}
`);
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

function uninstallGlobal() {
  const hooksFile = path.join(os.homedir(), '.claude', 'settings.json');
  const mcpFile = path.join(os.homedir(), '.claude', '.mcp.json');

  const hasHooks = hasAgentChatConfig(hooksFile);
  const hasMcp = hasAgentChatConfig(mcpFile);

  if (!hasHooks && !hasMcp) {
    console.log('No AgentChat configuration found globally — nothing to remove.');
    return;
  }

  // Teardown hooks from settings.json
  if (hasHooks) {
    const hooksSettings = readSettingsFile(hooksFile);
    const cleaned = teardownHooksOnly(hooksSettings);
    writeOrDelete(hooksFile, cleaned);
  }

  // Teardown MCP from .mcp.json
  if (hasMcp) {
    const mcpSettings = readSettingsFile(mcpFile);
    const cleaned = teardownMcpOnly(mcpSettings);
    writeOrDelete(mcpFile, cleaned);
  }

  console.log(`
AgentChat configuration removed globally

Removed:
  - Hooks: SessionStart, SessionEnd, PreToolUse, PostToolUse (from ${hooksFile})
  - MCP Server: agent-chat (from ${mcpFile})

Other settings have been preserved.
`);
}

function uninstallProject(projectDir) {
  // Resolve to absolute path
  projectDir = path.resolve(projectDir);

  if (!fs.existsSync(projectDir)) {
    console.log(`Directory not found: ${projectDir} — nothing to remove.`);
    return;
  }

  const hooksFile = path.join(projectDir, '.claude', 'settings.json');
  const mcpFile = path.join(projectDir, '.mcp.json');

  const hasHooks = hasAgentChatConfig(hooksFile);
  const hasMcp = hasAgentChatConfig(mcpFile);

  if (!hasHooks && !hasMcp) {
    console.log(`No AgentChat configuration found in ${projectDir} — nothing to remove.`);
    return;
  }

  // Teardown hooks from settings.json
  if (hasHooks) {
    const hooksSettings = readSettingsFile(hooksFile);
    const cleaned = teardownHooksOnly(hooksSettings);
    writeOrDelete(hooksFile, cleaned);
  }

  // Teardown MCP from .mcp.json
  if (hasMcp) {
    const mcpSettings = readSettingsFile(mcpFile);
    const cleaned = teardownMcpOnly(mcpSettings);
    writeOrDelete(mcpFile, cleaned);
  }

  console.log(`
AgentChat configuration removed from: ${projectDir}

Removed:
  - Hooks: SessionStart, SessionEnd, PreToolUse, PostToolUse (from ${hooksFile})
  - MCP Server: agent-chat (from ${mcpFile})

Other settings have been preserved.
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseCliArgs(process.argv);

  if (args.help || !args.command) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const agentChatDir = resolveAgentChatDir();
  validateMcpBinary(agentChatDir);

  if (args.command === 'install') {
    if (args.global) {
      installGlobal(agentChatDir);
    } else {
      const projectDir = args.project || process.cwd();
      installProject(agentChatDir, projectDir);
    }
  } else if (args.command === 'uninstall') {
    if (args.global) {
      uninstallGlobal();
    } else {
      const projectDir = args.project || process.cwd();
      uninstallProject(projectDir);
    }
  }
}

main();
