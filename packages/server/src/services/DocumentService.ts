import type { Document } from '@agent-chat/shared';
import type { createDocumentQueries } from '../db/queries/documents.js';
import type { EventEmitter } from 'events';

type DocumentQueries = ReturnType<typeof createDocumentQueries>;

export interface CreateDocumentData {
  channelId: string;
  title: string;
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
  createdById: string;
  createdByName: string;
  createdByType: 'agent' | 'human';
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

  async create(tenantId: string, data: CreateDocumentData): Promise<Document> {
    const document = await this.q.insertDocument(tenantId, data);
    if (this.emitter) {
      this.emitter.emit('document:created', document);
    }
    return document;
  }

  getById(tenantId: string, documentId: string): Document | null {
    return this.q.getDocumentById(tenantId, documentId);
  }

  listByChannel(tenantId: string, channelId: string): Document[] {
    return this.q.getDocumentsByChannel(tenantId, channelId);
  }

  async update(tenantId: string, documentId: string, data: UpdateDocumentData): Promise<Document | null> {
    const document = await this.q.updateDocument(tenantId, documentId, data);
    if (document && this.emitter) {
      this.emitter.emit('document:updated', document);
    }
    return document;
  }
}
