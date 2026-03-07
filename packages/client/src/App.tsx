import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import './App.css';

export function App() {
  const [_selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const handleChannelSelect = useCallback((tenantId: string, channelId: string) => {
    setSelectedTenantId(tenantId);
    setSelectedChannelId(channelId);
  }, []);

  return (
    <div className="app">
      <Sidebar
        selectedChannelId={selectedChannelId}
        onChannelSelect={handleChannelSelect}
      />
      <main className="main-content">
        {selectedChannelId ? (
          <div className="placeholder">Channel selected: {selectedChannelId}</div>
        ) : (
          <div className="placeholder">Select a channel to start</div>
        )}
      </main>
    </div>
  );
}
