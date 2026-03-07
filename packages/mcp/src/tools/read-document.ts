import type { Services } from '@agent-chat/server';

export interface ReadDocumentArgs {
  document_id: string;
}

export function handleReadDocument(
  services: Services,
  tenantId: string,
  args: ReadDocumentArgs
): {
  id: string;
  title: string;
  content: string;
  contentType: string;
  channelId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
} | null {
  const doc = services.documents.getById(tenantId, args.document_id);
  if (!doc) return null;

  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    contentType: doc.contentType,
    channelId: doc.channelId,
    createdByName: doc.createdByName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
