import { useState, useEffect, useCallback } from 'react';
import type { Document } from '@agent-chat/shared';
import { fetchDocuments } from '../lib/api';

interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  error: string | null;
  addDocument: (doc: Document) => void;
  updateDocument: (doc: Document) => void;
}

export function useDocuments(tenantId: string | null, channelId: string | null): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !channelId) {
      setDocuments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocuments(tenantId, channelId)
      .then((docs) => {
        if (!cancelled) {
          setDocuments(docs);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load documents');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [tenantId, channelId]);

  const addDocument = useCallback((doc: Document) => {
    setDocuments(prev => {
      // Deduplicate by ID
      if (prev.some(d => d.id === doc.id)) return prev;
      return [...prev, doc];
    });
  }, []);

  const updateDocument = useCallback((doc: Document) => {
    setDocuments(prev =>
      prev.map(d => d.id === doc.id ? doc : d)
    );
  }, []);

  return { documents, loading, error, addDocument, updateDocument };
}
