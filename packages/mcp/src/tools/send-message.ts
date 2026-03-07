import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';

export interface SendMessageArgs {
  channel_id: string;
  content: string;
  parent_message_id?: string;
  metadata?: Record<string, unknown>;
}

export async function handleSendMessage(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: SendMessageArgs
): Promise<{ id: string; channelId: string; content: string; createdAt: string }> {
  const message = await services.messages.send(tenantId, {
    channelId: args.channel_id,
    senderId: config.agentId,
    senderName: config.agentName,
    senderType: 'agent',
    content: args.content,
    messageType: 'text',
    parentMessageId: args.parent_message_id,
    metadata: args.metadata,
  });

  return {
    id: message.id,
    channelId: message.channelId,
    content: message.content,
    createdAt: message.createdAt,
  };
}
