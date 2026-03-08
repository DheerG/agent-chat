import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, WriteQueue, createServices } from '@agent-chat/server';
import type { DbInstance, Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import { handleGetTeamContext } from '../tools/get-team-context.js';
import { handleGetAgentActivity } from '../tools/get-agent-activity.js';
import { handleCheckin } from '../tools/checkin.js';
import { handleGetTeamMembers } from '../tools/get-team-members.js';

describe('Context MCP Tool Handlers', () => {
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

    const tenant = await services.tenants.upsertByCodebasePath('test-project', '/test/project');
    tenantId = tenant.id;
    const channel = await services.channels.create(tenantId, { name: 'test-channel' });
    channelId = channel.id;
  });

  afterEach(() => {
    instance.close();
  });

  // Helper to create messages
  async function sendMessage(senderId: string, senderName: string, content: string, chId?: string) {
    return services.messages.send(tenantId, {
      channelId: chId ?? channelId,
      senderId,
      senderName,
      senderType: 'agent',
      content,
    });
  }

  describe('checkin', () => {
    it('records first check-in with null previous', async () => {
      const result = await handleCheckin(services, config, tenantId);
      expect(result.checked_in_at).toBeDefined();
      expect(result.previous_checkin).toBeNull();
    });

    it('returns previous check-in on subsequent calls', async () => {
      const first = await handleCheckin(services, config, tenantId);
      await new Promise(r => setTimeout(r, 15));
      const second = await handleCheckin(services, config, tenantId);
      expect(second.previous_checkin).toBe(first.checked_in_at);
    });
  });

  describe('get_team_context', () => {
    it('returns empty summary with no messages', async () => {
      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.message_count).toBe(0);
      expect(result.channels_active).toEqual([]);
      expect(result.last_checkin).toBeNull();
    });

    it('returns summary of messages in a channel', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Hello world');
      await sendMessage('agent-3', 'Agent Three', 'Hi there');

      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.message_count).toBe(2);
      expect(result.channels_active).toContain('test-channel');
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('test-channel');
      expect(result.summary).toContain('2 messages');
    });

    it('returns full messages when include_full_messages is true', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Hello');

      const result = await handleGetTeamContext(services, config, tenantId, {
        include_full_messages: true,
      });
      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBe(1);
      expect(result.messages![0].content).toBe('Hello');
      expect(result.summary).toBeUndefined();
    });

    it('filters by channel_id', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      await sendMessage('agent-2', 'Agent Two', 'In main channel');
      await sendMessage('agent-2', 'Agent Two', 'In other channel', ch2.id);

      const result = await handleGetTeamContext(services, config, tenantId, {
        channel_id: channelId,
      });
      expect(result.message_count).toBe(1);
    });

    it('filters by since timestamp', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Old message');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 15));
      await sendMessage('agent-2', 'Agent Two', 'New message');

      const result = await handleGetTeamContext(services, config, tenantId, {
        since,
      });
      expect(result.message_count).toBe(1);
    });

    it('supports since=last_checkin', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Before checkin');
      await new Promise(r => setTimeout(r, 15));
      await handleCheckin(services, config, tenantId);
      await new Promise(r => setTimeout(r, 15));
      await sendMessage('agent-2', 'Agent Two', 'After checkin');

      const result = await handleGetTeamContext(services, config, tenantId, {
        since: 'last_checkin',
      });
      expect(result.message_count).toBe(1);
    });

    it('returns all messages when since=last_checkin but no prior check-in exists', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Message 1');
      await sendMessage('agent-2', 'Agent Two', 'Message 2');

      const result = await handleGetTeamContext(services, config, tenantId, {
        since: 'last_checkin',
      });
      expect(result.message_count).toBe(2);
    });

    it('returns last_checkin value in response', async () => {
      const checkin = await handleCheckin(services, config, tenantId);
      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.last_checkin).toBe(checkin.checked_in_at);
    });

    it('includes messages from multiple channels', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'second-channel' });
      await sendMessage('agent-2', 'Agent Two', 'In main');
      await sendMessage('agent-3', 'Agent Three', 'In second', ch2.id);

      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.message_count).toBe(2);
      expect(result.channels_active).toContain('test-channel');
      expect(result.channels_active).toContain('second-channel');
    });

    it('summary shows active agents', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Hello');
      await sendMessage('agent-3', 'Agent Three', 'Hi');

      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.summary).toContain('Agent Two');
      expect(result.summary).toContain('Agent Three');
    });

    it('summary truncates long messages', async () => {
      const longContent = 'A'.repeat(300);
      await sendMessage('agent-2', 'Agent Two', longContent);

      const result = await handleGetTeamContext(services, config, tenantId, {});
      expect(result.summary).toContain('...');
    });
  });

  describe('get_agent_activity', () => {
    it('returns own messages by default', async () => {
      await sendMessage(config.agentId, config.agentName, 'My message');
      await sendMessage('other-agent', 'Other', 'Their message');

      const result = await handleGetAgentActivity(services, config, tenantId, {});
      expect(result.message_count).toBe(1);
      expect(result.messages[0].content).toBe('My message');
    });

    it('returns messages for a specific agent by name', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Hello');
      await sendMessage('agent-3', 'Agent Three', 'Hi');

      const result = await handleGetAgentActivity(services, config, tenantId, {
        agent_name: 'Agent Two',
      });
      expect(result.message_count).toBe(1);
      expect(result.messages[0].senderName).toBe('Agent Two');
    });

    it('does case-insensitive name matching', async () => {
      await sendMessage('agent-2', 'Agent Two', 'Hello');

      const result = await handleGetAgentActivity(services, config, tenantId, {
        agent_name: 'agent two',
      });
      expect(result.message_count).toBe(1);
    });

    it('filters by since timestamp', async () => {
      await sendMessage(config.agentId, config.agentName, 'Old');
      await new Promise(r => setTimeout(r, 15));
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 15));
      await sendMessage(config.agentId, config.agentName, 'New');

      const result = await handleGetAgentActivity(services, config, tenantId, {
        since,
      });
      expect(result.message_count).toBe(1);
      expect(result.messages[0].content).toBe('New');
    });

    it('filters by channel_id', async () => {
      const ch2 = await services.channels.create(tenantId, { name: 'other-channel' });
      await sendMessage(config.agentId, config.agentName, 'In main');
      await sendMessage(config.agentId, config.agentName, 'In other', ch2.id);

      const result = await handleGetAgentActivity(services, config, tenantId, {
        channel_id: channelId,
      });
      expect(result.message_count).toBe(1);
    });

    it('returns empty when agent has no messages', async () => {
      const result = await handleGetAgentActivity(services, config, tenantId, {
        agent_name: 'nonexistent-agent',
      });
      expect(result.message_count).toBe(0);
      expect(result.messages).toEqual([]);
    });

    it('supports since=last_checkin', async () => {
      await sendMessage(config.agentId, config.agentName, 'Before checkin');
      await new Promise(r => setTimeout(r, 15));
      await handleCheckin(services, config, tenantId);
      await new Promise(r => setTimeout(r, 15));
      await sendMessage(config.agentId, config.agentName, 'After checkin');

      const result = await handleGetAgentActivity(services, config, tenantId, {
        since: 'last_checkin',
      });
      expect(result.message_count).toBe(1);
      expect(result.messages[0].content).toBe('After checkin');
    });
  });

  describe('get_team_members', () => {
    it('returns team name from tenant', () => {
      const oldTeamsDir = process.env['TEAMS_DIR'];
      process.env['TEAMS_DIR'] = '/tmp/non-existent-teams-dir-' + Date.now();
      try {
        const result = handleGetTeamMembers(services, config, tenantId);
        expect(result.team_name).toBe('test-project');
      } finally {
        if (oldTeamsDir !== undefined) {
          process.env['TEAMS_DIR'] = oldTeamsDir;
        } else {
          delete process.env['TEAMS_DIR'];
        }
      }
    });

    it('returns empty members when no team config exists', () => {
      const oldTeamsDir = process.env['TEAMS_DIR'];
      process.env['TEAMS_DIR'] = '/tmp/non-existent-teams-dir-' + Date.now();
      try {
        const result = handleGetTeamMembers(services, config, tenantId);
        expect(result.members).toEqual([]);
      } finally {
        if (oldTeamsDir !== undefined) {
          process.env['TEAMS_DIR'] = oldTeamsDir;
        } else {
          delete process.env['TEAMS_DIR'];
        }
      }
    });

    it('returns presence-based members as fallback', async () => {
      await services.presence.upsert(tenantId, {
        agentId: 'agent-1',
        channelId: channelId,
        status: 'active',
      });

      const oldTeamsDir = process.env['TEAMS_DIR'];
      process.env['TEAMS_DIR'] = '/tmp/non-existent-teams-dir-' + Date.now();
      try {
        const result = handleGetTeamMembers(services, config, tenantId);
        expect(result.members.length).toBe(1);
        expect(result.members[0].agentId).toBe('agent-1');
        expect(result.members[0].status).toBe('active');
      } finally {
        if (oldTeamsDir !== undefined) {
          process.env['TEAMS_DIR'] = oldTeamsDir;
        } else {
          delete process.env['TEAMS_DIR'];
        }
      }
    });

    it('reads team config from filesystem when available', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-chat-test-'));
      const teamDir = path.join(tmpDir, 'test-project');
      fs.mkdirSync(teamDir, { recursive: true });
      fs.writeFileSync(path.join(teamDir, 'config.json'), JSON.stringify({
        name: 'test-project',
        description: 'Test team',
        members: [
          { name: 'researcher', agentId: 'researcher@test', agentType: 'general-purpose' },
          { name: 'planner', agentId: 'planner@test', agentType: 'planner' },
        ],
      }));

      const oldTeamsDir = process.env['TEAMS_DIR'];
      process.env['TEAMS_DIR'] = tmpDir;
      try {
        const result = handleGetTeamMembers(services, config, tenantId);
        expect(result.team_name).toBe('test-project');
        expect(result.members.length).toBe(2);
        expect(result.members[0].name).toBe('researcher');
        expect(result.members[0].agentType).toBe('general-purpose');
        expect(result.members[1].name).toBe('planner');
      } finally {
        if (oldTeamsDir !== undefined) {
          process.env['TEAMS_DIR'] = oldTeamsDir;
        } else {
          delete process.env['TEAMS_DIR'];
        }
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
