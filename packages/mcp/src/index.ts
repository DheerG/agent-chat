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
import { handleCreateDocument } from './tools/create-document.js';
import { handleReadDocument } from './tools/read-document.js';
import { handleUpdateDocument } from './tools/update-document.js';
import { handleListDocuments } from './tools/list-documents.js';
import { handleGetTeamContext } from './tools/get-team-context.js';
import { handleGetAgentActivity } from './tools/get-agent-activity.js';
import { handleCheckin } from './tools/checkin.js';
import { handleGetTeamMembers } from './tools/get-team-members.js';

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

server.tool(
  'create_document',
  'Create a new document pinned to a channel',
  {
    channel_id: z.string().describe('Channel ID to pin document to'),
    title: z.string().describe('Document title'),
    content: z.string().describe('Document content'),
    content_type: z.enum(['text', 'markdown', 'json']).optional().describe('Content type (default: text)'),
  },
  async ({ channel_id, title, content, content_type }) => {
    try {
      const result = await handleCreateDocument(services, config, tenantId, {
        channel_id, title, content, content_type,
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
  'read_document',
  'Read a document by its ID',
  {
    document_id: z.string().describe('Document ID to read'),
  },
  async ({ document_id }) => {
    try {
      const result = handleReadDocument(services, tenantId, { document_id });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Document not found' }) }],
          isError: true,
        };
      }
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
  'update_document',
  'Update an existing document (title and/or content)',
  {
    document_id: z.string().describe('Document ID to update'),
    title: z.string().optional().describe('New title (omit to keep current)'),
    content: z.string().optional().describe('New content (omit to keep current)'),
  },
  async ({ document_id, title, content }) => {
    try {
      const result = await handleUpdateDocument(services, tenantId, {
        document_id, title, content,
      });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Document not found' }) }],
          isError: true,
        };
      }
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
  'list_documents',
  'List all documents pinned to a channel',
  {
    channel_id: z.string().describe('Channel ID to list documents for'),
  },
  async ({ channel_id }) => {
    try {
      const result = handleListDocuments(services, tenantId, { channel_id });
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

// Context persistence and recovery tools (Phase 13)
server.tool(
  'get_team_context',
  'Get summary of recent team activity. Use since="last_checkin" to get updates since your last check-in.',
  {
    since: z.string().optional().describe('ISO timestamp or "last_checkin" — filter messages after this time'),
    channel_id: z.string().optional().describe('Scope to a specific channel (omit for all channels)'),
    include_full_messages: z.boolean().optional().describe('If true, return full messages instead of summary (default: false)'),
  },
  async ({ since, channel_id, include_full_messages }) => {
    try {
      const result = await handleGetTeamContext(services, config, tenantId, {
        since, channel_id, include_full_messages,
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
  'get_agent_activity',
  'Get messages sent by a specific agent. Defaults to your own activity.',
  {
    agent_name: z.string().optional().describe('Agent name to query (defaults to you)'),
    since: z.string().optional().describe('ISO timestamp or "last_checkin" — filter messages after this time'),
    channel_id: z.string().optional().describe('Scope to a specific channel (omit for all channels)'),
  },
  async ({ agent_name, since, channel_id }) => {
    try {
      const result = await handleGetAgentActivity(services, config, tenantId, {
        agent_name, since, channel_id,
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
  'checkin',
  'Record a check-in timestamp. Use this after consuming context to set your "last_checkin" watermark.',
  {},
  async () => {
    try {
      const result = await handleCheckin(services, config, tenantId);
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
  'get_team_members',
  'Get information about team members (names, roles, types).',
  {},
  async () => {
    try {
      const result = handleGetTeamMembers(services, config, tenantId);
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
