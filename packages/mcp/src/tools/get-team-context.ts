import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';
import type { Message } from '@agent-chat/shared';

export interface GetTeamContextArgs {
  since?: string;                 // ISO timestamp or 'last_checkin'
  channel_id?: string;            // scope to one channel
  include_full_messages?: boolean; // default false
}

interface ChannelSummary {
  channelId: string;
  channelName: string;
  messageCount: number;
  activeSenders: string[];
  latestMessage: { sender: string; content: string; createdAt: string } | null;
}

export interface GetTeamContextResult {
  summary?: string;
  messages?: Array<{
    id: string;
    channelId: string;
    senderId: string;
    senderName: string;
    content: string;
    messageType: string;
    createdAt: string;
  }>;
  message_count: number;
  channels_active: string[];
  last_checkin: string | null;
}

export async function handleGetTeamContext(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: GetTeamContextArgs
): Promise<GetTeamContextResult> {
  // Resolve 'since' parameter
  let since: string | undefined = args.since;
  const lastCheckin = services.checkins.getLastCheckin(config.agentId, tenantId);

  if (since === 'last_checkin') {
    if (!lastCheckin) {
      since = undefined; // No previous check-in — return recent messages
    } else {
      since = lastCheckin;
    }
  }

  // Fetch messages
  let allMessages: Message[];
  if (args.channel_id) {
    // Single channel mode
    const result = services.messages.list(tenantId, args.channel_id, { limit: 200 });
    allMessages = since
      ? result.messages.filter(m => m.createdAt > since!)
      : result.messages;
  } else {
    // Cross-channel mode — get all channels then query each
    const channels = services.channels.listByTenant(tenantId);
    allMessages = [];
    for (const ch of channels) {
      const result = services.messages.list(tenantId, ch.id, { limit: 200 });
      const filtered = since
        ? result.messages.filter(m => m.createdAt > since!)
        : result.messages;
      allMessages.push(...filtered);
    }
    // Sort by createdAt and limit
    allMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (allMessages.length > 200) {
      allMessages = allMessages.slice(0, 200);
    }
  }

  // Build channel list
  const channelIds = [...new Set(allMessages.map(m => m.channelId))];
  const channels = services.channels.listByTenant(tenantId);
  const channelNameMap = new Map(channels.map(c => [c.id, c.name]));
  const channelsActive = channelIds.map(id => channelNameMap.get(id) ?? id);

  if (args.include_full_messages) {
    return {
      messages: allMessages.map(m => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        senderName: m.senderName,
        content: m.content,
        messageType: m.messageType,
        createdAt: m.createdAt,
      })),
      message_count: allMessages.length,
      channels_active: channelsActive,
      last_checkin: lastCheckin,
    };
  }

  // Generate summary
  const channelSummaries: ChannelSummary[] = [];
  for (const chId of channelIds) {
    const chMessages = allMessages.filter(m => m.channelId === chId);
    const senders = [...new Set(chMessages.map(m => m.senderName))];
    const latest = chMessages[chMessages.length - 1];
    channelSummaries.push({
      channelId: chId,
      channelName: channelNameMap.get(chId) ?? chId,
      messageCount: chMessages.length,
      activeSenders: senders,
      latestMessage: latest ? {
        sender: latest.senderName,
        content: latest.content.length > 200 ? latest.content.slice(0, 200) + '...' : latest.content,
        createdAt: latest.createdAt,
      } : null,
    });
  }

  const sinceLabel = since ?? 'all time';
  let summary = `Team activity since ${sinceLabel}:\n\n`;
  for (const cs of channelSummaries) {
    summary += `Channel "${cs.channelName}" (${cs.messageCount} messages):\n`;
    summary += `  Active agents: ${cs.activeSenders.join(', ')}\n`;
    if (cs.latestMessage) {
      summary += `  Latest: [${cs.latestMessage.sender}] "${cs.latestMessage.content}"\n`;
    }
    summary += '\n';
  }
  summary += `Total: ${allMessages.length} messages across ${channelIds.length} channel(s)`;

  return {
    summary,
    message_count: allMessages.length,
    channels_active: channelsActive,
    last_checkin: lastCheckin,
  };
}
