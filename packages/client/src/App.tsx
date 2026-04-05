import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, WsServerMessage, Session, ConversationListItem } from '@agent-chat/shared';
import { ConversationList } from './components/ConversationList';
import { ConversationHeader } from './components/ConversationHeader';
import { MessageFeed } from './components/MessageFeed';
import { useConversations } from './hooks/useConversations';
import { useFeed } from './hooks/useFeed';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchConversation } from './lib/api';
import './App.css';

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'recent' | 'all'>('active');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationListItem | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [refreshCountdown, setRefreshCountdown] = useState(60);

  const { conversations, loading, error, updateConversation, reSort } = useConversations(tab, refreshKey);

  // Poll for new conversations every 60 seconds with visible countdown
  useEffect(() => {
    setRefreshCountdown(60);
    const id = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          setRefreshKey(k => k + 1);
          return 60;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);
  const { items, loading: feedLoading, error: feedError, addMessage } = useFeed(selectedId);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Load conversation details when selected
  useEffect(() => {
    if (!selectedId) { setSessions([]); setSelectedConversation(null); return; }
    // Clear unread count for selected conversation
    setUnreadCounts(prev => { const next = new Map(prev); next.delete(selectedId); return next; });
    fetchConversation(selectedId).then(data => {
      setSessions(data.sessions);
      setSelectedConversation({
        ...data.conversation,
        summary: data.summary,
      } as ConversationListItem);
    }).catch(() => {});
  }, [selectedId]);

  // WebSocket handler
  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'message': {
        const wsMsg = msg as { conversationId: string; message: Message };
        if (wsMsg.conversationId === selectedIdRef.current) {
          addMessage(wsMsg.message);
        } else {
          // Track unread for non-selected conversations
          setUnreadCounts(prev => {
            const next = new Map(prev);
            next.set(wsMsg.conversationId, (prev.get(wsMsg.conversationId) ?? 0) + 1);
            return next;
          });
        }
        break;
      }
      case 'summary_update': {
        const upd = msg as { conversationId: string; summary: unknown };
        updateConversation(upd.conversationId, { summary: upd.summary } as Partial<ConversationListItem>);
        reSort();
        break;
      }
    }
  }, [addMessage, updateConversation, reSort]);

  useWebSocket(handleWsMessage);

  // Update tab title
  useEffect(() => {
    const totalUnread = Array.from(unreadCounts.values()).reduce((sum, n) => sum + n, 0);
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) AgentChat`;
    } else {
      document.title = 'AgentChat';
    }
  }, [unreadCounts]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div className="app">
      <ConversationList
        conversations={conversations}
        loading={loading}
        error={error}
        selectedId={selectedId}
        tab={tab}
        refreshCountdown={refreshCountdown}
        onTabChange={setTab}
        onSelect={handleSelect}
        unreadCounts={unreadCounts}
      />

      <main className="main-content" aria-label="Conversation">
        {selectedId && selectedConversation ? (
          <>
            <ConversationHeader
              conversation={selectedConversation}
              sessions={sessions}
            />
            <MessageFeed
              items={items}
              loading={feedLoading}
              error={feedError}
            />
          </>
        ) : (
          <div className="placeholder">
            <div className="placeholder-content">
              <h2 className="placeholder-title">Welcome to AgentChat v2</h2>
              <p className="placeholder-text">Select a conversation to view agent activity</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
