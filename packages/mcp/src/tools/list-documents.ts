import type { Services } from '@agent-chat/server';

export interface ListDocumentsArgs {
  channel_id: string;
}

export function handleListDocuments(
  services: Services,
  tenantId: string,
  args: ListDocumentsArgs
): Array<{
  id: string;
  title: string;
  contentType: string;
  createdByName: string;
  updatedAt: string;
}> {
  const docs = services.documents.listByChannel(tenantId, args.channel_id);
  return docs.map(doc => ({
    id: doc.id,
    title: doc.title,
    contentType: doc.contentType,
    createdByName: doc.createdByName,
    updatedAt: doc.updatedAt,
  }));
}
