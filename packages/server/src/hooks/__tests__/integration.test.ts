import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DbInstance } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices, type Services } from '../../services/index.js';
import { createApp } from '../../http/app.js';
import { dispatchHookEvent } from '../handlers.js';

// Replicate MCP tool logic inline to test cross-path data sharing.
// This avoids circular workspace dependencies between server and mcp packages.
// The logic here matches packages/mcp/src/tools/*.ts exactly.

function mcpReadChannel(services: Services, agentId: string, tenantId: string, channelId: string) {
  const result = services.messages.list(tenantId, channelId, {});
  const filtered = result.messages.filter(msg => msg.senderId !== agentId);
  return {
    messages: filtered,
    hasMore: result.pagination.hasMore,
  };
}

function mcpListChannels(services: Services, tenantId: string) {
  return services.channels.listByTenant(tenantId);
}

async function mcpSendMessage(
  services: Services,
  tenantId: string,
  agentId: string,
  agentName: string,
  channelId: string,
  content: string
) {
  return services.messages.send(tenantId, {
    channelId,
    senderId: agentId,
    senderName: agentName,
    senderType: 'agent',
    content,
    messageType: 'text',
  });
}

describe('Cross-path Integration: Hooks + MCP', () => {
  let instance: DbInstance;
  let services: Services;
  let app: ReturnType<typeof createApp>;
  const sessionId = 'cross-path-session-001';
  const cwd = '/Users/test/cross-path-project';
  const agentId = 'mcp-agent-001';
  const agentName = 'MCP Agent';

  beforeEach(() => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);
    app = createApp(services);
  });

  it('SessionStart hook creates channel visible via MCP list_channels (AGNT-04 + AGNT-06)', async () => {
    // Hook: SessionStart
    await dispatchHookEvent(services, 'SessionStart', {
      session_id: sessionId,
      cwd,
    });

    // MCP: list_channels should see the session channel
    const tenants = services.tenants.listAll();
    expect(tenants.length).toBe(1);
    const channels = mcpListChannels(services, tenants[0].id);
    expect(channels.length).toBe(1);
    expect(channels[0].name).toBe(`session-${sessionId}`);
    expect(channels[0].type).toBe('session');
  });

  it('PreToolUse hook event visible via MCP read_channel (AGNT-03 + AGNT-02)', async () => {
    // Setup: create session channel via hook
    await dispatchHookEvent(services, 'SessionStart', {
      session_id: sessionId,
      cwd,
    });

    // Hook: PreToolUse event
    await dispatchHookEvent(services, 'PreToolUse', {
      session_id: sessionId,
      cwd,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });

    // MCP: read_channel with a different agent ID should see the hook event
    const tenants = services.tenants.listAll();
    const channels = mcpListChannels(services, tenants[0].id);
    const result = mcpReadChannel(services, agentId, tenants[0].id, channels[0].id);

    // Should see: system message (session start) + PreToolUse event
    const events = result.messages.filter(m => m.messageType === 'event');
    expect(events.length).toBe(1);
    expect(events[0].metadata.tool_name).toBe('Bash');
  });

  it('MCP send_message visible via HTTP REST API (AGNT-01)', async () => {
    // Setup: create tenant and channel
    const tenant = await services.tenants.upsertByCodebasePath('test', cwd);
    const channel = await services.channels.create(tenant.id, { name: 'api-test' });

    // MCP: send message
    await mcpSendMessage(services, tenant.id, agentId, agentName, channel.id, 'Hello via MCP');

    // HTTP: GET messages
    const res = await app.request(
      `/api/tenants/${tenant.id}/channels/${channel.id}/messages`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { messages: Array<{ content: string; senderId: string; senderType: string }> };
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].content).toBe('Hello via MCP');
    expect(body.messages[0].senderId).toBe(agentId);
    expect(body.messages[0].senderType).toBe('agent');
  });

  it('Agent self-exclusion works across MCP boundary (AGNT-02)', async () => {
    const tenant = await services.tenants.upsertByCodebasePath('test', cwd);
    const channel = await services.channels.create(tenant.id, { name: 'self-test' });

    // MCP: agent sends its own message
    await mcpSendMessage(services, tenant.id, agentId, agentName, channel.id, 'My message');

    // Another sender posts
    await services.messages.send(tenant.id, {
      channelId: channel.id,
      senderId: 'human-user',
      senderName: 'Alice',
      senderType: 'human',
      content: 'Human message',
    });

    // MCP: read_channel should only show the human message
    const result = mcpReadChannel(services, agentId, tenant.id, channel.id);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].content).toBe('Human message');
  });

  it('Full lifecycle: SessionStart -> send_message -> PreToolUse -> read_channel', async () => {
    // 1. Hook: SessionStart creates channel
    await dispatchHookEvent(services, 'SessionStart', {
      session_id: sessionId,
      cwd,
    });

    const tenants = services.tenants.listAll();
    const channels = mcpListChannels(services, tenants[0].id);
    const channelId = channels[0].id;

    // 2. MCP: Agent sends a message
    await mcpSendMessage(services, tenants[0].id, agentId, agentName, channelId, 'Agent working...');

    // 3. Hook: PreToolUse event from the same session
    await dispatchHookEvent(services, 'PreToolUse', {
      session_id: sessionId,
      cwd,
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: '...' },
    });

    // 4. MCP: read_channel for a DIFFERENT agent
    const otherAgentResult = mcpReadChannel(services, 'other-agent', tenants[0].id, channelId);

    // Other agent should see everything: system msg + agent msg + hook event
    expect(otherAgentResult.messages.length).toBeGreaterThanOrEqual(3);

    // 5. MCP: read_channel for THE SAME agent (self-exclusion)
    const selfResult = mcpReadChannel(services, agentId, tenants[0].id, channelId);

    // Same agent should NOT see its own message, but should see system + hook events
    const selfContents = selfResult.messages.map(m => m.content);
    expect(selfContents).not.toContain('Agent working...');
    // Hook events have senderId = sessionId, not agentId, so they should be visible
    const hookEvents = selfResult.messages.filter(m => m.messageType === 'event');
    expect(hookEvents.length).toBeGreaterThanOrEqual(1);
  });
});
