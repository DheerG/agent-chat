import { useState, useCallback, useEffect } from 'react';
import type { Message, Document } from '@agent-chat/shared';
import { Sidebar } from './components/Sidebar';
import { ChannelHeader } from './components/ChannelHeader';
import { MessageFeed } from './components/MessageFeed';
import { ThreadPanel } from './components/ThreadPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { usePresence } from './hooks/usePresence';
import { useMessages } from './hooks/useMessages';
import { useDocuments } from './hooks/useDocuments';
import { useWebSocket } from './hooks/useWebSocket';
import { useTenants } from './hooks/useTenants';
import { useChannels } from './hooks/useChannels';
import {
  archiveChannel as apiArchiveChannel,
  archiveTenant as apiArchiveTenant,
  restoreChannel as apiRestoreChannel,
  restoreTenant as apiRestoreTenant,
} from './lib/api';
import './App.css';

const TENANT_STORAGE_KEY = 'agentchat_selected_tenant';

export function App() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allChatsMode, setAllChatsMode] = useState(false);

  // Lift tenants to App level for coordination
  const { tenants, loading: tenantsLoading, error: tenantsError } = useTenants(refreshKey);

  // Get channels for selected tenant (used to derive channel name)
  // Include stale channels so we can find the name of any selected channel
  const { channels } = useChannels(selectedTenantId, refreshKey, true);

  // Auto-select tenant from localStorage or first available
  useEffect(() => {
    if (tenantsLoading || tenants.length === 0) return;
    // Already selected and valid — skip
    if (selectedTenantId && tenants.find(t => t.id === selectedTenantId)) return;

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TENANT_STORAGE_KEY);
    } catch {
      // localStorage may not be available in test environments
    }
    if (saved && tenants.find(t => t.id === saved)) {
      setSelectedTenantId(saved);
    } else {
      setSelectedTenantId(tenants[0]!.id);
    }
  }, [tenants, tenantsLoading, selectedTenantId]);

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

  const handleTenantSelect = useCallback((tenantId: string) => {
    // Unsubscribe from old channel
    if (selectedChannelId) unsubscribe(selectedChannelId);
    setSelectedTenantId(tenantId);
    setSelectedChannelId(null);
    setSelectedThread(null);
    try {
      localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
    } catch {
      // localStorage may not be available
    }
  }, [selectedChannelId, unsubscribe]);

  const handleChannelSelect = useCallback((tenantId: string, channelId: string) => {
    // Unsubscribe from old channel
    if (selectedChannelId) {
      unsubscribe(selectedChannelId);
    }
    setSelectedTenantId(tenantId);
    setSelectedChannelId(channelId);
    setSelectedThread(null);
    // Subscribe to new channel
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

  const handleToggleAllChats = useCallback(() => {
    setAllChatsMode(prev => !prev);
  }, []);

  // Derive current tenant and channel names
  const currentTenant = tenants.find(t => t.id === selectedTenantId);
  const currentChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="app">
      <Sidebar
        selectedTenantId={selectedTenantId}
        selectedChannelId={selectedChannelId}
        tenants={tenants}
        tenantsLoading={tenantsLoading}
        tenantsError={tenantsError}
        onTenantSelect={handleTenantSelect}
        onChannelSelect={handleChannelSelect}
        onArchiveChannel={handleArchiveChannel}
        onArchiveTenant={handleArchiveTenant}
        onRestoreChannel={handleRestoreChannel}
        onRestoreTenant={handleRestoreTenant}
        refreshKey={refreshKey}
        allChatsMode={allChatsMode}
        onToggleAllChats={handleToggleAllChats}
      />
      <main className={`main-content ${selectedThread ? 'main-content--with-thread' : ''}`} aria-label="Message area">
        {selectedTenantId && selectedChannelId ? (
          <>
            <ChannelHeader
              channelName={currentChannel?.name ?? ''}
              tenantName={currentTenant?.name ?? ''}
            />
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
          <div className="placeholder">
            <div className="placeholder-content">
              <h2 className="placeholder-title">Welcome to AgentChat</h2>
              <p className="placeholder-text">Select a channel from the sidebar to view messages</p>
            </div>
          </div>
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
