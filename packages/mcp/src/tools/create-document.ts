import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';

export interface CreateDocumentArgs {
  channel_id: string;
  title: string;
  content: string;
  content_type?: 'text' | 'markdown' | 'json';
}

export async function handleCreateDocument(
  services: Services,
  config: McpConfig,
  tenantId: string,
  args: CreateDocumentArgs
): Promise<{ id: string; title: string; channelId: string; createdAt: string }> {
  const document = await services.documents.create(tenantId, {
    channelId: args.channel_id,
    title: args.title,
    content: args.content,
    contentType: args.content_type,
    createdById: config.agentId,
    createdByName: config.agentName,
    createdByType: 'agent',
  });

  return {
    id: document.id,
    title: document.title,
    channelId: document.channelId,
    createdAt: document.createdAt,
  };
}
