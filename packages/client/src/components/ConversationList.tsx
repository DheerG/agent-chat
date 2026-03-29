import { useState, useMemo } from 'react';
import type { ConversationListItem } from '@agent-chat/shared';
import { ConversationItem } from './ConversationItem';

interface Props {
  conversations: ConversationListItem[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  tab: 'active' | 'recent' | 'all';
  onTabChange: (tab: 'active' | 'recent' | 'all') => void;
  onSelect: (id: string) => void;
  unreadCounts?: Map<string, number>;
}

export function ConversationList({ conversations, loading, error, selectedId, tab, onTabChange, onSelect, unreadCounts }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.workspaceName ?? '').toLowerCase().includes(q)
    );
  }, [conversations, search]);

  return (
    <nav className="left-panel" aria-label="Conversations">
      <div className="left-panel__header">
        <h1 className="left-panel__title">AgentChat</h1>
      </div>

      <div className="left-panel__search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search conversations"
        />
      </div>

      <div className="left-panel__tabs" role="tablist">
        {(['active', 'recent', 'all'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab-button ${tab === t ? 'tab-button--active' : ''}`}
            onClick={() => onTabChange(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="left-panel__list" role="listbox" aria-label="Conversation list">
        {loading && <div className="left-panel__loading">Loading...</div>}
        {error && <div className="left-panel__error">{error}</div>}
        {!loading && filtered.length === 0 && (
          <div className="left-panel__empty">
            {search ? 'No matches' : 'No conversations'}
          </div>
        )}
        {filtered.map(c => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isSelected={c.id === selectedId}
            compact={tab === 'all'}
            unreadCount={unreadCounts?.get(c.id) ?? 0}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </nav>
  );
}
