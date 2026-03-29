import { eq, and, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DbInstance } from '../index.js';
import { documents } from '@agent-chat/shared';
import type { Document, DocumentRow } from '@agent-chat/shared';
import type { WriteQueue } from '../queue.js';

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    conversationId: row.conversationId,
    title: row.title,
    content: row.content,
    contentType: row.contentType,
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDocumentQueries(instance: DbInstance, queue: WriteQueue) {
  const { db } = instance;

  return {
    async insertDocument(
      conversationId: string,
      data: {
        title: string;
        content: string;
        contentType?: 'text' | 'markdown' | 'json';
        createdById: string;
        createdByName: string;
      }
    ): Promise<Document> {
      const id = ulid();
      const now = new Date().toISOString();

      await queue.enqueue(() =>
        db.insert(documents).values({
          id,
          conversationId,
          title: data.title,
          content: data.content,
          contentType: data.contentType ?? 'text',
          createdById: data.createdById,
          createdByName: data.createdByName,
          createdAt: now,
          updatedAt: now,
        }).run()
      );

      return {
        id,
        conversationId,
        title: data.title,
        content: data.content,
        contentType: data.contentType ?? 'text',
        createdById: data.createdById,
        createdByName: data.createdByName,
        createdAt: now,
        updatedAt: now,
      };
    },

    getDocumentById(conversationId: string, documentId: string): Document | null {
      const row = db.select().from(documents)
        .where(and(eq(documents.conversationId, conversationId), eq(documents.id, documentId)))
        .get();
      return row ? rowToDocument(row) : null;
    },

    getDocumentsByConversation(conversationId: string): Document[] {
      return db.select().from(documents)
        .where(eq(documents.conversationId, conversationId))
        .orderBy(asc(documents.updatedAt))
        .all()
        .map(rowToDocument);
    },

    async updateDocument(
      conversationId: string,
      documentId: string,
      data: { title?: string; content?: string }
    ): Promise<Document | null> {
      const existing = db.select().from(documents)
        .where(and(eq(documents.conversationId, conversationId), eq(documents.id, documentId)))
        .get();

      if (!existing) return null;

      const updatedAt = new Date().toISOString();
      const updates: Partial<{ title: string; content: string; updatedAt: string }> = { updatedAt };
      if (data.title !== undefined) updates.title = data.title;
      if (data.content !== undefined) updates.content = data.content;

      await queue.enqueue(() =>
        db.update(documents)
          .set(updates)
          .where(and(eq(documents.conversationId, conversationId), eq(documents.id, documentId)))
          .run()
      );

      const updated = db.select().from(documents)
        .where(and(eq(documents.conversationId, conversationId), eq(documents.id, documentId)))
        .get();

      return updated ? rowToDocument(updated) : null;
    },
  };
}
