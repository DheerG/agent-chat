import type { Services } from '@agent-chat/server';
import type { Message } from '@agent-chat/shared';
import type { McpConfig } from '../config.js';

export interface ReadChannelArgs {
  channel_id: string;
  limit?: number;
  after?: string;
}

export interface ReadChannelResult {
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    senderType: string;
    content: string;
    messageType: string;
    createdAt: string;
  }>;
  hasMore: boolean;
}

export function handleReadChannel(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: ReadChannelArgs
): ReadChannelResult {
  const result = services.messages.list(tenantId, args.channel_id, {
    limit: args.limit,
    after: args.after,
  });

  // AGNT-02: Self-exclusion — filter out messages sent by this agent
  const filtered = result.messages.filter(
    (msg: Message) => msg.senderId !== config.agentId
  );

  return {
    messages: filtered.map((msg: Message) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderType: msg.senderType,
      content: msg.content,
      messageType: msg.messageType,
      createdAt: msg.createdAt,
    })),
    hasMore: result.pagination.hasMore,
  };
}
