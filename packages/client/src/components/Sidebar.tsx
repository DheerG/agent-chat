import { useState } from 'react';
import { useTenants } from '../hooks/useTenants';
import { useChannels } from '../hooks/useChannels';
import type { Tenant } from '@agent-chat/shared';
import './Sidebar.css';

interface SidebarProps {
  selectedChannelId: string | null;
  onChannelSelect: (tenantId: string, channelId: string) => void;
}

function TenantGroup({
  tenant,
  selectedChannelId,
  onChannelSelect,
}: {
  tenant: Tenant;
  selectedChannelId: string | null;
  onChannelSelect: (tenantId: string, channelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { channels, loading } = useChannels(tenant.id);

  return (
    <div className="tenant-group">
      <button
        className="tenant-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`tenant-chevron ${expanded ? 'tenant-chevron--expanded' : ''}`}>
          &#9656;
        </span>
        <span className="tenant-name">{tenant.name}</span>
        <span className="tenant-channel-count">{channels.length}</span>
      </button>
      {expanded && (
        <div className="channel-list">
          {loading && <div className="channel-loading">Loading...</div>}
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={`channel-item ${selectedChannelId === channel.id ? 'channel-item--active' : ''}`}
              onClick={() => onChannelSelect(tenant.id, channel.id)}
            >
              <span className="channel-hash">#</span>
              <span className="channel-name">{channel.name}</span>
            </button>
          ))}
          {!loading && channels.length === 0 && (
            <div className="channel-empty">No channels</div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ selectedChannelId, onChannelSelect }: SidebarProps) {
  const { tenants, loading, error } = useTenants();

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">AgentChat</h1>
      </div>
      <div className="sidebar-content">
        {loading && <div className="sidebar-loading">Loading tenants...</div>}
        {error && <div className="sidebar-error">{error}</div>}
        {tenants.map((tenant) => (
          <TenantGroup
            key={tenant.id}
            tenant={tenant}
            selectedChannelId={selectedChannelId}
            onChannelSelect={onChannelSelect}
          />
        ))}
        {!loading && !error && tenants.length === 0 && (
          <div className="sidebar-empty">No tenants found</div>
        )}
      </div>
    </aside>
  );
}
