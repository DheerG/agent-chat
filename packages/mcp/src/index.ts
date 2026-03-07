#!/usr/bin/env node
// MCP Server for AgentChat — stdio transport
// CRITICAL: Never use console.log() — it corrupts JSON-RPC messages on stdout.
// Use console.error() for all logging (writes to stderr).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import { loadConfig } from './config.js';
import { handleSendMessage } from './tools/send-message.js';
import { handleReadChannel } from './tools/read-channel.js';
import { handleListChannels } from './tools/list-channels.js';

const config = loadConfig();

// Initialize data layer — shares SQLite DB with HTTP server via WAL mode
const instance = createDb(config.dbPath);
const queue = new WriteQueue();
const services = createServices(instance, queue);

// Resolve tenant ID
let tenantId: string;
if (config.tenantId === 'auto') {
  // Auto-create tenant from working directory
  const cwd = process.env['AGENT_CHAT_CWD'] ?? process.cwd();
  const name = cwd.split('/').filter(Boolean).pop() ?? 'unknown';
  const tenant = await services.tenants.upsertByCodebasePath(name, cwd);
  tenantId = tenant.id;
} else {
  tenantId = config.tenantId;
}

const server = new McpServer({
  name: 'agent-chat',
  version: '1.0.0',
});

// Register tools
server.tool(
  'send_message',
  'Send a message to a channel in AgentChat',
  {
    channel_id: z.string().describe('Channel ID to send message to'),
    content: z.string().describe('Message content'),
    parent_message_id: z.string().optional().describe('Thread parent message ID for replies'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata JSON'),
  },
  async ({ channel_id, content, parent_message_id, metadata }) => {
    try {
      const result = await handleSendMessage(services, config, tenantId, {
        channel_id,
        content,
        parent_message_id,
        metadata,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  }
);

server.tool(
  'read_channel',
  'Read messages from a channel (excludes your own messages)',
  {
    channel_id: z.string().describe('Channel ID to read from'),
    limit: z.number().optional().describe('Max messages to return (default 50)'),
    after: z.string().optional().describe('ULID cursor — return messages after this ID'),
  },
  async ({ channel_id, limit, after }) => {
    try {
      const result = handleReadChannel(services, config, tenantId, {
        channel_id,
        limit,
        after,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  }
);

server.tool(
  'list_channels',
  'List all channels available in your tenant',
  {},
  async () => {
    try {
      const result = handleListChannels(services, tenantId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  }
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(JSON.stringify({
  event: 'mcp_server_started',
  agentId: config.agentId,
  agentName: config.agentName,
  tenantId,
}));
