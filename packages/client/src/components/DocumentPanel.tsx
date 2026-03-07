import { useState } from 'react';
import type { Document } from '@agent-chat/shared';
import './DocumentPanel.css';

interface DocumentPanelProps {
  documents: Document[];
  loading: boolean;
  error: string | null;
}

export function DocumentPanel({ documents, loading, error }: DocumentPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className="document-panel"><div className="document-panel__loading">Loading documents...</div></div>;
  }

  if (error) {
    return <div className="document-panel"><div className="document-panel__error">Error: {error}</div></div>;
  }

  if (documents.length === 0) {
    return <div className="document-panel"><div className="document-panel__empty">No documents in this channel</div></div>;
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="document-panel">
      <div className="document-panel__header">
        <span className="document-panel__title">Documents</span>
        <span className="document-panel__count">{documents.length}</span>
      </div>
      <div className="document-panel__list">
        {documents.map(doc => (
          <div key={doc.id} className={`document-item ${expandedId === doc.id ? 'document-item--expanded' : ''}`}>
            <button
              className="document-item__header"
              onClick={() => toggleExpand(doc.id)}
              aria-expanded={expandedId === doc.id}
            >
              <span className="document-item__icon">{expandedId === doc.id ? '\u25BC' : '\u25B6'}</span>
              <span className="document-item__name">{doc.title}</span>
              <span className={`document-item__badge document-item__badge--${doc.contentType}`}>{doc.contentType}</span>
            </button>
            <div className="document-item__meta">
              <span>{doc.createdByName}</span>
              <span>{'\u00B7'}</span>
              <span>{formatTime(doc.updatedAt)}</span>
            </div>
            {expandedId === doc.id && (
              <div className="document-item__content">
                <pre className="document-item__body">{doc.content}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
