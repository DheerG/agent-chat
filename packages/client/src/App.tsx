import { useState, useCallback } from 'react';
import type { Message } from '@agent-chat/shared';
import { Sidebar } from './components/Sidebar';
import { MessageFeed } from './components/MessageFeed';
import { ThreadPanel } from './components/ThreadPanel';
import { usePresence } from './hooks/usePresence';
import { useMessages } from './hooks/useMessages';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

export function App() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);

  const { getStatus } = usePresence(selectedTenantId, selectedChannelId);
  const { messages, loading, error, sendMessage, addMessage, lastSeenId } = useMessages(selectedTenantId, selectedChannelId);

  // WebSocket message handler
  const handleWsMessage = useCallback((msg: Message) => {
    if (selectedChannelId && msg.channelId === selectedChannelId) {
      addMessage(msg);
    }
  }, [selectedChannelId, addMessage]);

  const { subscribe, unsubscribe } = useWebSocket(selectedTenantId, handleWsMessage);

  const handleChannelSelect = useCallback((tenantId: string, channelId: string) => {
    // Unsubscribe from old channel
    if (selectedChannelId) {
      unsubscribe(selectedChannelId);
    }
    setSelectedTenantId(tenantId);
    setSelectedChannelId(channelId);
    setSelectedThread(null);
    // Subscribe to new channel (will happen via MessageFeed useEffect)
    subscribe(channelId);
  }, [selectedChannelId, subscribe, unsubscribe]);

  const handleThreadOpen = useCallback((parentMessage: Message) => {
    setSelectedThread(parentMessage);
  }, []);

  const handleThreadClose = useCallback(() => {
    setSelectedThread(null);
  }, []);

  const handleSend = useCallback((content: string) => {
    void sendMessage(content);
  }, [sendMessage]);

  return (
    <div className="app">
      <Sidebar
        selectedChannelId={selectedChannelId}
        onChannelSelect={handleChannelSelect}
      />
      <main className={`main-content ${selectedThread ? 'main-content--with-thread' : ''}`}>
        {selectedTenantId && selectedChannelId ? (
          <MessageFeed
            tenantId={selectedTenantId}
            channelId={selectedChannelId}
            getPresenceStatus={getStatus}
            onThreadOpen={handleThreadOpen}
            messages={messages}
            loading={loading}
            error={error}
            onSend={handleSend}
            lastSeenId={lastSeenId}
          />
        ) : (
          <div className="placeholder">Select a channel to start</div>
        )}
      </main>
      {selectedThread && selectedTenantId && selectedChannelId && (
        <ThreadPanel
          tenantId={selectedTenantId}
          channelId={selectedChannelId}
          parentMessage={selectedThread}
          allMessages={messages}
          onClose={handleThreadClose}
          getPresenceStatus={getStatus}
        />
      )}
    </div>
  );
}
