import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import type { DbInstance, Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import { handleSendMessage } from '../tools/send-message.js';
import { handleReadChannel } from '../tools/read-channel.js';
import { handleListChannels } from '../tools/list-channels.js';

describe('MCP Tool Handlers', () => {
  let instance: DbInstance;
  let services: Services;
  let tenantId: string;
  let channelId: string;

  const config: McpConfig = {
    dbPath: ':memory:',
    tenantId: 'auto',
    agentId: 'test-agent-001',
    agentName: 'Test Agent',
  };

  beforeEach(async () => {
    instance = createDb(':memory:');
    const queue = new WriteQueue();
    services = createServices(instance, queue);

    // Set up test tenant and channel
    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/project');
    tenantId = tenant.id;
    const channel = await services.channels.create(tenantId, { name: 'test-channel' });
    channelId = channel.id;
  });

  describe('send_message', () => {
    it('creates message with correct sender identity from config', async () => {
      const result = await handleSendMessage(services, config, tenantId, {
        channel_id: channelId,
        content: 'Hello from agent',
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBe('Hello from agent');
      expect(result.channelId).toBe(channelId);

      // Verify the message was stored with correct sender
      const msg = services.messages.getById(tenantId, result.id);
      expect(msg).not.toBeNull();
      expect(msg!.senderId).toBe('test-agent-001');
      expect(msg!.senderName).toBe('Test Agent');
      expect(msg!.senderType).toBe('agent');
    });

    it('creates threaded reply with parent_message_id', async () => {
      const parent = await handleSendMessage(services, config, tenantId, {
        channel_id: channelId,
        content: 'Parent message',
      });

      const reply = await handleSendMessage(services, config, tenantId, {
        channel_id: channelId,
        content: 'Reply message',
        parent_message_id: parent.id,
      });

      const replyMsg = services.messages.getById(tenantId, reply.id);
      expect(replyMsg!.parentMessageId).toBe(parent.id);
    });

    it('stores optional metadata', async () => {
      const result = await handleSendMessage(services, config, tenantId, {
        channel_id: channelId,
        content: 'With metadata',
        metadata: { priority: 'high', tags: ['urgent'] },
      });

      const msg = services.messages.getById(tenantId, result.id);
      expect(msg!.metadata.priority).toBe('high');
    });
  });

  describe('read_channel', () => {
    it('excludes messages from the calling agent (self-exclusion)', async () => {
      // Send message as the configured agent
      await handleSendMessage(services, config, tenantId, {
        channel_id: channelId,
        content: 'My own message',
      });

      // Send message as a different sender
      await services.messages.send(tenantId, {
        channelId,
        senderId: 'other-agent',
        senderName: 'Other Agent',
        senderType: 'agent',
        content: 'Message from other agent',
      });

      const result = handleReadChannel(services, config, tenantId, {
        channel_id: channelId,
      });

      // Should only see the other agent's message, not our own
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].content).toBe('Message from other agent');
      expect(result.messages[0].senderId).toBe('other-agent');
    });

    it('includes messages from other senders (human, hook, system)', async () => {
      await services.messages.send(tenantId, {
        channelId,
        senderId: 'human-1',
        senderName: 'Alice',
        senderType: 'human',
        content: 'Human message',
      });

      await services.messages.send(tenantId, {
        channelId,
        senderId: 'hook-session',
        senderName: 'Hook',
        senderType: 'hook',
        content: 'Hook event',
        messageType: 'event',
      });

      await services.messages.send(tenantId, {
        channelId,
        senderId: 'system',
        senderName: 'System',
        senderType: 'system',
        content: 'System notification',
      });

      const result = handleReadChannel(services, config, tenantId, {
        channel_id: channelId,
      });

      expect(result.messages.length).toBe(3);
    });

    it('respects limit parameter', async () => {
      // Create 5 messages from other sender
      for (let i = 0; i < 5; i++) {
        await services.messages.send(tenantId, {
          channelId,
          senderId: 'other',
          senderName: 'Other',
          senderType: 'agent',
          content: `Message ${i}`,
        });
      }

      const result = handleReadChannel(services, config, tenantId, {
        channel_id: channelId,
        limit: 3,
      });

      // Limit is applied at the service layer before self-exclusion filter
      // Since none are self-messages, all 3 should be returned
      expect(result.messages.length).toBe(3);
    });

    it('paginates with after cursor', async () => {
      // Create 3 messages
      const msgs = [];
      for (let i = 0; i < 3; i++) {
        const msg = await services.messages.send(tenantId, {
          channelId,
          senderId: 'other',
          senderName: 'Other',
          senderType: 'agent',
          content: `Message ${i}`,
        });
        msgs.push(msg);
      }

      // Read after the first message
      const result = handleReadChannel(services, config, tenantId, {
        channel_id: channelId,
        after: msgs[0].id,
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].content).toBe('Message 1');
      expect(result.messages[1].content).toBe('Message 2');
    });

    it('returns empty when channel has no messages', () => {
      const result = handleReadChannel(services, config, tenantId, {
        channel_id: channelId,
      });

      expect(result.messages.length).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('list_channels', () => {
    it('returns all channels for tenant', () => {
      const result = handleListChannels(services, tenantId);
      expect(result.channels.length).toBe(1);
      expect(result.channels[0].name).toBe('test-channel');
      expect(result.channels[0].id).toBe(channelId);
    });

    it('returns multiple channels including session channels', async () => {
      await services.channels.create(tenantId, { name: 'channel-2' });
      await services.channels.create(tenantId, {
        name: 'session-abc',
        type: 'session',
        sessionId: 'sess-abc',
      });

      const result = handleListChannels(services, tenantId);
      expect(result.channels.length).toBe(3);
      const sessionChannel = result.channels.find(c => c.type === 'session');
      expect(sessionChannel).toBeDefined();
      expect(sessionChannel!.sessionId).toBe('sess-abc');
    });

    it('returns empty array when tenant has no channels', async () => {
      // Create a separate tenant with no channels
      const otherTenant = await services.tenants.upsertByCodebasePath('empty', '/empty');
      const result = handleListChannels(services, otherTenant.id);
      expect(result.channels.length).toBe(0);
    });
  });
});
