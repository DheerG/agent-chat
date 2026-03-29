import { useState, useEffect, useCallback } from 'react';
import type { ConversationListItem } from '@agent-chat/shared';
import { fetchConversations } from '../lib/api';

export function useConversations(tab: 'active' | 'recent' | 'all', refreshKey: number) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConversations(tab)
      .then(data => { if (!cancelled) { setConversations(data); setError(null); } })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, refreshKey]);

  const updateConversation = useCallback((id: string, updates: Partial<ConversationListItem>) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const addConversation = useCallback((conv: ConversationListItem) => {
    setConversations(prev => [conv, ...prev]);
  }, []);

  const reSort = useCallback(() => {
    setConversations(prev => {
      const sorted = [...prev];
      sorted.sort((a, b) => {
        // Status priority for active tab: error > idle > active > completed > inactive
        const statusOrder: Record<string, number> = { error: 0, idle: 1, active: 2, completed: 3, inactive: 4 };
        const sa = statusOrder[a.status] ?? 5;
        const sb = statusOrder[b.status] ?? 5;
        if (sa !== sb) return sa - sb;
        // Then by last activity
        const ta = a.summary?.lastMessageAt ?? a.updatedAt;
        const tb = b.summary?.lastMessageAt ?? b.updatedAt;
        return tb.localeCompare(ta);
      });
      return sorted;
    });
  }, []);

  return { conversations, loading, error, updateConversation, addConversation, reSort };
}
