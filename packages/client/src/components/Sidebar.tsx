import { useState, useEffect } from 'react';
import { useTenants } from '../hooks/useTenants';
import { useChannels } from '../hooks/useChannels';
import { fetchArchivedTenants, fetchArchivedChannels } from '../lib/api';
import type { Tenant, Channel } from '@agent-chat/shared';
import './Sidebar.css';

interface SidebarProps {
  selectedChannelId: string | null;
  onChannelSelect: (tenantId: string, channelId: string) => void;
  onArchiveChannel: (tenantId: string, channelId: string) => void;
  onArchiveTenant: (tenantId: string) => void;
  onRestoreChannel: (tenantId: string, channelId: string) => void;
  onRestoreTenant: (tenantId: string) => void;
  refreshKey: number;
}

function TenantGroup({
  tenant,
  selectedChannelId,
  onChannelSelect,
  onArchiveChannel,
  onArchiveTenant,
  refreshKey,
}: {
  tenant: Tenant;
  selectedChannelId: string | null;
  onChannelSelect: (tenantId: string, channelId: string) => void;
  onArchiveChannel: (tenantId: string, channelId: string) => void;
  onArchiveTenant: (tenantId: string) => void;
  refreshKey: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const { channels, loading } = useChannels(tenant.id, refreshKey);

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
        <span
          className="tenant-archive-btn"
          title="Archive tenant"
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Archive "${tenant.name}" and all its channels?`)) {
              onArchiveTenant(tenant.id);
            }
          }}
        >
          &#x2715;
        </span>
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
              <span
                className="channel-archive-btn"
                title="Archive channel"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Archive "#${channel.name}"?`)) {
                    onArchiveChannel(tenant.id, channel.id);
                  }
                }}
              >
                &#x2715;
              </span>
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

function ArchivedSection({
  activeTenants,
  onRestoreChannel,
  onRestoreTenant,
  refreshKey,
}: {
  activeTenants: Tenant[];
  onRestoreChannel: (tenantId: string, channelId: string) => void;
  onRestoreTenant: (tenantId: string) => void;
  refreshKey: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [archivedTenants, setArchivedTenants] = useState<Tenant[]>([]);
  const [archivedChannelsByTenant, setArchivedChannelsByTenant] = useState<Map<string, Channel[]>>(new Map());
  const [archivedChannelsFromActive, setArchivedChannelsFromActive] = useState<Map<string, Channel[]>>(new Map());

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;

    async function loadArchived() {
      try {
        // Fetch archived tenants
        const tenants = await fetchArchivedTenants();
        if (cancelled) return;
        setArchivedTenants(tenants);

        // Fetch archived channels for each archived tenant
        const channelMap = new Map<string, Channel[]>();
        for (const tenant of tenants) {
          const channels = await fetchArchivedChannels(tenant.id);
          if (cancelled) return;
          if (channels.length > 0) {
            channelMap.set(tenant.id, channels);
          }
        }
        setArchivedChannelsByTenant(channelMap);

        // Fetch archived channels from active tenants
        const activeChannelMap = new Map<string, Channel[]>();
        for (const tenant of activeTenants) {
          const channels = await fetchArchivedChannels(tenant.id);
          if (cancelled) return;
          if (channels.length > 0) {
            activeChannelMap.set(tenant.id, channels);
          }
        }
        setArchivedChannelsFromActive(activeChannelMap);
      } catch {
        // Silently handle errors for archived data fetching
      }
    }

    void loadArchived();
    return () => { cancelled = true; };
  }, [expanded, refreshKey, activeTenants]);

  const hasArchivedItems = archivedTenants.length > 0 || archivedChannelsFromActive.size > 0;

  return (
    <div className="archived-section">
      <button
        className="archived-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`tenant-chevron ${expanded ? 'tenant-chevron--expanded' : ''}`}>
          &#9656;
        </span>
        <span>Archived</span>
      </button>
      {expanded && (
        <div className="archived-content">
          {/* Archived channels from active tenants */}
          {Array.from(archivedChannelsFromActive.entries()).map(([tenantId, channels]) => {
            const tenant = activeTenants.find(t => t.id === tenantId);
            if (!tenant || channels.length === 0) return null;
            return (
              <div key={`active-${tenantId}`} className="archived-tenant-group">
                <div className="archived-tenant-name">{tenant.name}</div>
                {channels.map((channel) => (
                  <div key={channel.id} className="archived-channel">
                    <span className="channel-hash">#</span>
                    <span className="channel-name">{channel.name}</span>
                    <button
                      className="restore-btn"
                      title="Restore channel"
                      onClick={() => onRestoreChannel(tenantId, channel.id)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Archived tenants with their channels */}
          {archivedTenants.map((tenant) => (
            <div key={tenant.id} className="archived-tenant-group">
              <div className="archived-tenant">
                <span className="archived-tenant-name">{tenant.name}</span>
                <button
                  className="restore-btn"
                  title="Restore tenant"
                  onClick={() => onRestoreTenant(tenant.id)}
                >
                  Restore
                </button>
              </div>
              {(archivedChannelsByTenant.get(tenant.id) ?? []).map((channel) => (
                <div key={channel.id} className="archived-channel">
                  <span className="channel-hash">#</span>
                  <span className="channel-name">{channel.name}</span>
                </div>
              ))}
            </div>
          ))}

          {!hasArchivedItems && (
            <div className="archived-empty">No archived items</div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  selectedChannelId,
  onChannelSelect,
  onArchiveChannel,
  onArchiveTenant,
  onRestoreChannel,
  onRestoreTenant,
  refreshKey,
}: SidebarProps) {
  const { tenants, loading, error } = useTenants(refreshKey);

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
            onArchiveChannel={onArchiveChannel}
            onArchiveTenant={onArchiveTenant}
            refreshKey={refreshKey}
          />
        ))}
        {!loading && !error && tenants.length === 0 && (
          <div className="sidebar-empty">No tenants found</div>
        )}
        <ArchivedSection
          activeTenants={tenants}
          onRestoreChannel={onRestoreChannel}
          onRestoreTenant={onRestoreTenant}
          refreshKey={refreshKey}
        />
      </div>
    </aside>
  );
}
