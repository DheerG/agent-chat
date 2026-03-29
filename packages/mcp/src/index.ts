#!/usr/bin/env node
// MCP Server for AgentChat v2 — session-scoped, stdio transport
// CRITICAL: Never use console.log() — it corrupts JSON-RPC on stdout.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import { loadConfig } from './config.js';

const config = loadConfig();

const instance = createDb(config.dbPath);
const queue = new WriteQueue();
const services = createServices(instance, queue);

// Resolve conversation from session
function getConversationId(): string | null {
  const session = services.sessions.getById(config.sessionId);
  return session?.conversationId ?? null;
}

const server = new McpServer({
  name: 'agent-chat',
  version: '2.0.0',
});

// ─── send_message ───────────────────────────────────────────────────
server.tool(
  'send_message',
  'Send a message to your conversation in AgentChat',
  {
    content: z.string().describe('Message content'),
    parent_message_id: z.string().optional().describe('Thread parent message ID for replies'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata JSON'),
  },
  async ({ content, parent_message_id, metadata }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const message = await services.messages.send(conversationId, {
        senderId: config.sessionId,
        senderName: config.agentName,
        senderType: 'agent',
        content,
        parentMessageId: parent_message_id,
        metadata,
      });

      await services.conversations.incrementMessages(conversationId, content, config.agentName);
      return ok(message);
    } catch (e) { return err(e); }
  }
);

// ─── read_conversation ──────────────────────────────────────────────
server.tool(
  'read_conversation',
  'Read messages from your conversation (excludes your own messages)',
  {
    limit: z.number().optional().describe('Max messages to return (default 50)'),
    after: z.string().optional().describe('ULID cursor — return messages after this ID'),
  },
  async ({ limit, after }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const { messages } = services.messages.list(conversationId, { limit, after });
      const filtered = messages.filter(m => m.senderId !== config.sessionId);
      return ok({ messages: filtered, count: filtered.length });
    } catch (e) { return err(e); }
  }
);

// ─── list_conversations ─────────────────────────────────────────────
server.tool(
  'list_conversations',
  'List all conversations available',
  {},
  async () => {
    try {
      const conversations = services.conversations.listWithSummaries('recent', 20);
      return ok({ conversations: conversations.map(c => ({ id: c.id, name: c.name, status: c.status, type: c.type })) });
    } catch (e) { return err(e); }
  }
);

// ─── report_status ──────────────────────────────────────────────────
server.tool(
  'report_status',
  'Report your current work status. Shown in the AgentChat dashboard.',
  {
    status: z.string().describe('What you are working on right now'),
    progress: z.number().min(0).max(1).optional().describe('Progress from 0.0 to 1.0'),
  },
  async ({ status, progress }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const message = await services.messages.send(conversationId, {
        senderId: config.sessionId,
        senderName: config.agentName,
        senderType: 'agent',
        content: status,
        messageType: 'status',
        metadata: progress != null ? { progress } : {},
      });

      await services.conversations.incrementMessages(conversationId, status, config.agentName);
      return ok({ reported: true, messageId: message.id });
    } catch (e) { return err(e); }
  }
);

// ─── report_error ───────────────────────────────────────────────────
server.tool(
  'report_error',
  'Report an error you encountered. Surfaces prominently in the dashboard.',
  {
    error: z.string().describe('Error description'),
    action: z.string().optional().describe('How you are handling it'),
  },
  async ({ error, action }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const content = action ? `${error}\nAction: ${action}` : error;
      const message = await services.messages.send(conversationId, {
        senderId: config.sessionId,
        senderName: config.agentName,
        senderType: 'agent',
        content,
        messageType: 'error',
        metadata: { error, action },
      });

      await services.conversations.incrementMessages(conversationId, content, config.agentName);
      await services.conversations.updateStatus(conversationId, 'error');
      return ok({ reported: true, messageId: message.id });
    } catch (e) { return err(e); }
  }
);

// ─── request_input ──────────────────────────────────────────────────
server.tool(
  'request_input',
  'Ask the human for a decision. Creates a persistent alert in AgentChat.',
  {
    question: z.string().describe('Your question for the human'),
    options: z.array(z.string()).optional().describe('Optional list of choices'),
  },
  async ({ question, options }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const message = await services.messages.send(conversationId, {
        senderId: config.sessionId,
        senderName: config.agentName,
        senderType: 'agent',
        content: question,
        messageType: 'input_request',
        metadata: options ? { options } : {},
      });

      await services.conversations.setAttentionNeeded(conversationId, true);
      await services.conversations.incrementMessages(conversationId, question, config.agentName);
      return ok({ requested: true, messageId: message.id });
    } catch (e) { return err(e); }
  }
);

// ─── Document tools ─────────────────────────────────────────────────
server.tool(
  'create_document',
  'Create a new document pinned to your conversation',
  {
    title: z.string().describe('Document title'),
    content: z.string().describe('Document content'),
    content_type: z.enum(['text', 'markdown', 'json']).optional().describe('Content type (default: text)'),
  },
  async ({ title, content, content_type }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const doc = await services.documents.create(conversationId, {
        title, content, contentType: content_type,
        createdById: config.sessionId, createdByName: config.agentName,
      });
      return ok(doc);
    } catch (e) { return err(e); }
  }
);

server.tool(
  'read_document',
  'Read a document by its ID',
  { document_id: z.string().describe('Document ID to read') },
  async ({ document_id }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');
      const doc = services.documents.getById(conversationId, document_id);
      if (!doc) return err('Document not found');
      return ok(doc);
    } catch (e) { return err(e); }
  }
);

server.tool(
  'update_document',
  'Update an existing document',
  {
    document_id: z.string().describe('Document ID to update'),
    title: z.string().optional().describe('New title'),
    content: z.string().optional().describe('New content'),
  },
  async ({ document_id, title, content }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');
      const doc = await services.documents.update(conversationId, document_id, { title, content });
      if (!doc) return err('Document not found');
      return ok(doc);
    } catch (e) { return err(e); }
  }
);

server.tool(
  'list_documents',
  'List all documents in your conversation',
  {},
  async () => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');
      const docs = services.documents.listByConversation(conversationId);
      return ok({ documents: docs });
    } catch (e) { return err(e); }
  }
);

// ─── Context tools ──────────────────────────────────────────────────
server.tool(
  'get_team_context',
  'Get summary of recent team activity',
  {
    since: z.string().optional().describe('ISO timestamp — filter messages after this time'),
  },
  async ({ since }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      const summary = services.conversations.getSummary(conversationId);
      const sessions = services.sessions.getByConversation(conversationId);

      let recentMessages;
      if (since) {
        recentMessages = services.messages.getMessagesSince(conversationId, since, 50);
      } else {
        recentMessages = services.messages.list(conversationId, { limit: 20 }).messages;
      }

      return ok({ summary, sessions, recentMessages });
    } catch (e) { return err(e); }
  }
);

server.tool(
  'get_team_members',
  'Get information about team members',
  {},
  async () => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');
      const sessions = services.sessions.getByConversation(conversationId);
      return ok({ members: sessions.map(s => ({ id: s.id, name: s.agentName, type: s.agentType, model: s.model, status: s.status })) });
    } catch (e) { return err(e); }
  }
);

// ─── checkin ────────────────────────────────────────────────────────
server.tool(
  'checkin',
  'Record a check-in timestamp. Sets your "last seen" watermark for get_team_context since=last_checkin.',
  {},
  async () => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      // Store checkin as a status message with checkin metadata
      const now = new Date().toISOString();
      await services.messages.send(conversationId, {
        senderId: config.sessionId,
        senderName: config.agentName,
        senderType: 'agent',
        content: `Checked in at ${now}`,
        messageType: 'status',
        metadata: { checkin: true, timestamp: now },
      });

      return ok({ checkedIn: true, timestamp: now });
    } catch (e) { return err(e); }
  }
);

// ─── get_agent_activity ─────────────────────────────────────────────
server.tool(
  'get_agent_activity',
  'Get activity events for a specific agent. Defaults to your own activity.',
  {
    agent_name: z.string().optional().describe('Agent name to query (defaults to you)'),
    since: z.string().optional().describe('ISO timestamp — filter events after this time'),
  },
  async ({ agent_name, since }) => {
    try {
      const conversationId = getConversationId();
      if (!conversationId) return err('No conversation found for this session');

      // Find the session for the requested agent
      const allSessions = services.sessions.getByConversation(conversationId);
      const targetName = agent_name ?? config.agentName;
      const targetSession = allSessions.find(s => s.agentName === targetName);
      const sessionId = targetSession?.id ?? config.sessionId;

      const events = services.activityEvents.getBySession(sessionId, {
        after: since ?? undefined,
        limit: 50,
      });

      return ok({
        agent: targetName,
        sessionId,
        events: events.map(e => ({
          type: e.eventType,
          tool: e.toolName,
          summary: e.summary,
          isError: e.isError,
          time: e.createdAt,
        })),
      });
    } catch (e) { return err(e); }
  }
);

// ─── Helpers ────────────────────────────────────────────────────────
function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function err(e: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(e) }) }], isError: true };
}

// Connect
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(JSON.stringify({
  event: 'mcp_server_started',
  sessionId: config.sessionId,
  agentName: config.agentName,
  version: '2.0.0',
}));
