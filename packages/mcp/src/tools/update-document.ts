import type { Services } from '@agent-chat/server';

export interface UpdateDocumentArgs {
  document_id: string;
  title?: string;
  content?: string;
}

export async function handleUpdateDocument(
  services: Services,
  tenantId: string,
  args: UpdateDocumentArgs
): Promise<{ id: string; title: string; updatedAt: string } | null> {
  const document = await services.documents.update(tenantId, args.document_id, {
    title: args.title,
    content: args.content,
  });

  if (!document) return null;

  return {
    id: document.id,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}
