import type { EventEmitter } from 'events';
import type { Document } from '@agent-chat/shared';
import type { createDocumentQueries } from '../db/queries/documents.js';

type DocumentQueries = ReturnType<typeof createDocumentQueries>;

export interface CreateDocumentData {
  title: string;
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
  createdById: string;
  createdByName: string;
}

export interface UpdateDocumentData {
  title?: string;
  content?: string;
}

export class DocumentService {
  constructor(
    private q: DocumentQueries,
    private emitter?: EventEmitter,
  ) {}

  async create(conversationId: string, data: CreateDocumentData): Promise<Document> {
    const document = await this.q.insertDocument(conversationId, data);
    this.emitter?.emit('document:created', document);
    return document;
  }

  getById(conversationId: string, documentId: string): Document | null {
    return this.q.getDocumentById(conversationId, documentId);
  }

  listByConversation(conversationId: string): Document[] {
    return this.q.getDocumentsByConversation(conversationId);
  }

  async update(conversationId: string, documentId: string, data: UpdateDocumentData): Promise<Document | null> {
    const document = await this.q.updateDocument(conversationId, documentId, data);
    if (document) this.emitter?.emit('document:updated', document);
    return document;
  }
}
