import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import type { Message } from '@agent-chat/shared';

export interface GetAgentActivityArgs {
  agent_name?: string;   // defaults to calling agent
  since?: string;        // ISO timestamp or 'last_checkin'
  channel_id?: string;   // scope to one channel
}

export interface GetAgentActivityResult {
  messages: Array<{
    id: string;
    channelId: string;
    senderId: string;
    senderName: string;
    content: string;
    messageType: string;
    createdAt: string;
  }>;
  message_count: number;
}

export async function handleGetAgentActivity(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: GetAgentActivityArgs
): Promise<GetAgentActivityResult> {
  const targetName = args.agent_name ?? config.agentName;

  // Resolve 'since' parameter
  let since: string | undefined = args.since;
  if (since === 'last_checkin') {
    const lastCheckin = services.checkins.getLastCheckin(config.agentId, tenantId);
    since = lastCheckin ?? undefined;
  }

  // Fetch and filter messages
  let allMessages: Message[];
  if (args.channel_id) {
    const result = services.messages.list(tenantId, args.channel_id, { limit: 200 });
    allMessages = result.messages;
  } else {
    const channels = services.channels.listByTenant(tenantId);
    allMessages = [];
    for (const ch of channels) {
      const result = services.messages.list(tenantId, ch.id, { limit: 200 });
      allMessages.push(...result.messages);
    }
  }

  // Filter by sender name (case-insensitive match on senderName)
  let filtered = allMessages.filter(
    m => m.senderName.toLowerCase() === targetName.toLowerCase()
  );

  // Filter by time
  if (since) {
    filtered = filtered.filter(m => m.createdAt > since!);
  }

  // Sort chronologically and limit
  filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filtered.length > 100) {
    filtered = filtered.slice(0, 100);
  }

  return {
    messages: filtered.map(m => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      senderName: m.senderName,
      content: m.content,
      messageType: m.messageType,
      createdAt: m.createdAt,
    })),
    message_count: filtered.length,
  };
}
