import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import type { DbInstance, Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import { handleSendMessage } from '../tools/send-message.js';
import { handleReadChannel } from '../tools/read-channel.js';
import { handleListChannels } from '../tools/list-channels.js';

describe('MCP Integration', () => {
  let instance: DbInstance;
  let services: Services;
  let tenantId: string;

  const config: McpConfig = {
    dbPath: ':memory:',
    tenantId: 'auto',
    agentId: 'integration-agent',
    agentName: 'Integration Agent',
  };

  beforeEach(async () => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);

    const tenant = await services.tenants.upsertByCodebasePath('integration-project', '/test/integration');
    tenantId = tenant.id;
  });

  it('send_message creates message retrievable via read_channel by another agent', async () => {
    const channel = await services.channels.create(tenantId, { name: 'integration-test' });

    // Agent sends a message
    const sent = await handleSendMessage(services, config, tenantId, {
      channel_id: channel.id,
      content: 'Hello from integration test',
    });

    expect(sent.id).toBeDefined();

    // Different agent reads the channel — should see the message
    const otherConfig: McpConfig = { ...config, agentId: 'other-agent', agentName: 'Other' };
    const result = handleReadChannel(services, otherConfig, tenantId, {
      channel_id: channel.id,
    });

    expect(result.messages.length).toBe(1);
    expect(result.messages[0].content).toBe('Hello from integration test');
    expect(result.messages[0].senderId).toBe('integration-agent');
  });

  it('send_message is NOT visible to the same agent via read_channel (self-exclusion end-to-end)', async () => {
    const channel = await services.channels.create(tenantId, { name: 'self-test' });

    await handleSendMessage(services, config, tenantId, {
      channel_id: channel.id,
      content: 'My own message',
    });

    // Same agent reads — should not see own message
    const result = handleReadChannel(services, config, tenantId, {
      channel_id: channel.id,
    });

    expect(result.messages.length).toBe(0);
  });

  it('list_channels shows channels created via service layer', async () => {
    await services.channels.create(tenantId, { name: 'channel-a' });
    await services.channels.create(tenantId, {
      name: 'session-xyz',
      type: 'session',
      sessionId: 'xyz',
    });

    const result = handleListChannels(services, tenantId);
    expect(result.channels.length).toBe(2);

    const names = result.channels.map(c => c.name).sort();
    expect(names).toEqual(['channel-a', 'session-xyz']);
  });

  it('multiple agents can exchange messages in the same channel', async () => {
    const channel = await services.channels.create(tenantId, { name: 'multi-agent' });

    const agent1: McpConfig = { ...config, agentId: 'agent-1', agentName: 'Agent 1' };
    const agent2: McpConfig = { ...config, agentId: 'agent-2', agentName: 'Agent 2' };

    // Agent 1 sends
    await handleSendMessage(services, agent1, tenantId, {
      channel_id: channel.id,
      content: 'Message from Agent 1',
    });

    // Agent 2 sends
    await handleSendMessage(services, agent2, tenantId, {
      channel_id: channel.id,
      content: 'Message from Agent 2',
    });

    // Agent 1 reads — should see Agent 2's message only
    const result1 = handleReadChannel(services, agent1, tenantId, {
      channel_id: channel.id,
    });
    expect(result1.messages.length).toBe(1);
    expect(result1.messages[0].content).toBe('Message from Agent 2');

    // Agent 2 reads — should see Agent 1's message only
    const result2 = handleReadChannel(services, agent2, tenantId, {
      channel_id: channel.id,
    });
    expect(result2.messages.length).toBe(1);
    expect(result2.messages[0].content).toBe('Message from Agent 1');
  });
});
