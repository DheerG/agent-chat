import { useState, useCallback } from 'react';
import type { Message, Document } from '@agent-chat/shared';
import { Sidebar } from './components/Sidebar';
import { MessageFeed } from './components/MessageFeed';
import { ThreadPanel } from './components/ThreadPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { usePresence } from './hooks/usePresence';
import { useMessages } from './hooks/useMessages';
import { useDocuments } from './hooks/useDocuments';
import { useWebSocket } from './hooks/useWebSocket';
import {
  archiveChannel as apiArchiveChannel,
  archiveTenant as apiArchiveTenant,
  restoreChannel as apiRestoreChannel,
  restoreTenant as apiRestoreTenant,
} from './lib/api';
import './App.css';

export function App() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { getStatus } = usePresence(selectedTenantId, selectedChannelId);
  const { messages, loading, error, sendMessage, addMessage, lastSeenId } = useMessages(selectedTenantId, selectedChannelId);
  const { documents, loading: docsLoading, error: docsError, addDocument, updateDocument: updateDoc } = useDocuments(selectedTenantId, selectedChannelId);

  // WebSocket message handler
  const handleWsMessage = useCallback((msg: Message) => {
    if (selectedChannelId && msg.channelId === selectedChannelId) {
      addMessage(msg);
    }
  }, [selectedChannelId, addMessage]);

  // WebSocket document handlers
  const handleDocCreated = useCallback((doc: Document) => {
    if (selectedChannelId && doc.channelId === selectedChannelId) {
      addDocument(doc);
    }
  }, [selectedChannelId, addDocument]);

  const handleDocUpdated = useCallback((doc: Document) => {
    if (selectedChannelId && doc.channelId === selectedChannelId) {
      updateDoc(doc);
    }
  }, [selectedChannelId, updateDoc]);

  const { subscribe, unsubscribe } = useWebSocket(selectedTenantId, handleWsMessage, handleDocCreated, handleDocUpdated);

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

  const handleArchiveChannel = useCallback(async (tenantId: string, channelId: string) => {
    await apiArchiveChannel(tenantId, channelId);
    // If archiving the currently-viewed channel, deselect it
    if (channelId === selectedChannelId) {
      if (selectedChannelId) unsubscribe(selectedChannelId);
      setSelectedChannelId(null);
      setSelectedTenantId(null);
      setSelectedThread(null);
    }
    setRefreshKey(k => k + 1);
  }, [selectedChannelId, unsubscribe]);

  const handleArchiveTenant = useCallback(async (tenantId: string) => {
    await apiArchiveTenant(tenantId);
    // If currently viewing a channel in this tenant, deselect
    if (tenantId === selectedTenantId) {
      if (selectedChannelId) unsubscribe(selectedChannelId);
      setSelectedChannelId(null);
      setSelectedTenantId(null);
      setSelectedThread(null);
    }
    setRefreshKey(k => k + 1);
  }, [selectedTenantId, selectedChannelId, unsubscribe]);

  const handleRestoreChannel = useCallback(async (tenantId: string, channelId: string) => {
    await apiRestoreChannel(tenantId, channelId);
    setRefreshKey(k => k + 1);
  }, []);

  const handleRestoreTenant = useCallback(async (tenantId: string) => {
    await apiRestoreTenant(tenantId);
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="app">
      <Sidebar
        selectedChannelId={selectedChannelId}
        onChannelSelect={handleChannelSelect}
        onArchiveChannel={handleArchiveChannel}
        onArchiveTenant={handleArchiveTenant}
        onRestoreChannel={handleRestoreChannel}
        onRestoreTenant={handleRestoreTenant}
        refreshKey={refreshKey}
      />
      <main className={`main-content ${selectedThread ? 'main-content--with-thread' : ''}`}>
        {selectedTenantId && selectedChannelId ? (
          <>
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
            <DocumentPanel
              documents={documents}
              loading={docsLoading}
              error={docsError}
            />
          </>
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
