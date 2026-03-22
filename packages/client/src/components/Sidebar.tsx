import { useState, useEffect, useCallback } from 'react';
import { useChannels, type ChannelWithStale } from '../hooks/useChannels';
import { fetchArchivedTenants, fetchArchivedChannels } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import type { Tenant, Channel } from '@agent-chat/shared';
import './Sidebar.css';

interface SidebarProps {
  selectedTenantId: string | null;
  selectedChannelId: string | null;
  tenants: Tenant[];
  tenantsLoading: boolean;
  tenantsError: string | null;
  onTenantSelect: (tenantId: string) => void;
  onChannelSelect: (tenantId: string, channelId: string) => void;
  onArchiveChannel: (tenantId: string, channelId: string) => void;
  onArchiveTenant: (tenantId: string) => void;
  onRestoreChannel: (tenantId: string, channelId: string) => void;
  onRestoreTenant: (tenantId: string) => void;
  refreshKey: number;
}

interface PendingArchive {
  type: 'tenant' | 'channel';
  tenantId: string;
  channelId?: string;
  name: string;
}

function ArchivedSection({
  selectedTenantId,
  tenants,
  onRestoreChannel,
  onRestoreTenant,
  refreshKey,
}: {
  selectedTenantId: string | null;
  tenants: Tenant[];
  onRestoreChannel: (tenantId: string, channelId: string) => void;
  onRestoreTenant: (tenantId: string) => void;
  refreshKey: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [archivedTenants, setArchivedTenants] = useState<Tenant[]>([]);
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;

    async function loadArchived() {
      try {
        // Fetch archived tenants
        const tenants = await fetchArchivedTenants();
        if (cancelled) return;
        setArchivedTenants(tenants);

        // Fetch archived channels for selected tenant
        if (selectedTenantId) {
          const channels = await fetchArchivedChannels(selectedTenantId);
          if (cancelled) return;
          setArchivedChannels(channels);
        }
      } catch {
        // Silently handle errors for archived data fetching
      }
    }

    void loadArchived();
    return () => { cancelled = true; };
  }, [expanded, refreshKey, selectedTenantId, tenants]);

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

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
          {/* Archived channels from selected tenant */}
          {archivedChannels.length > 0 && selectedTenant && (
            <div className="archived-tenant-group">
              <div className="archived-tenant-name">{selectedTenant.name}</div>
              {archivedChannels.map((channel) => (
                <div key={channel.id} className="archived-channel">
                  <span className="channel-hash">#</span>
                  <span className="channel-name">{channel.name}</span>
                  <button
                    className="restore-btn"
                    title="Restore channel"
                    onClick={() => onRestoreChannel(selectedTenantId!, channel.id)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Archived tenants */}
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
            </div>
          ))}

          {archivedChannels.length === 0 && archivedTenants.length === 0 && (
            <div className="archived-empty">No archived items</div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  selectedTenantId,
  selectedChannelId,
  tenants,
  tenantsLoading,
  tenantsError,
  onTenantSelect,
  onChannelSelect,
  onArchiveChannel,
  onArchiveTenant,
  onRestoreChannel,
  onRestoreTenant,
  refreshKey,
}: SidebarProps) {
  // Always fetch with stale flag so we can filter client-side
  const { channels, loading: channelsLoading } = useChannels(selectedTenantId, refreshKey, true);
  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(null);
  const [showStale, setShowStale] = useState<boolean>(() => {
    try {
      return localStorage.getItem('agentchat_show_stale') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleStale = useCallback(() => {
    setShowStale(prev => {
      const next = !prev;
      try {
        localStorage.setItem('agentchat_show_stale', String(next));
      } catch {
        // localStorage may not be available
      }
      return next;
    });
  }, []);

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  // Compute visible channels based on stale toggle
  const staleChannels = (channels as ChannelWithStale[]).filter(c => c.stale);
  const activeChannels = (channels as ChannelWithStale[]).filter(c => !c.stale);
  const visibleChannels = showStale ? channels : activeChannels;
  const hiddenStaleCount = staleChannels.length;

  return (
    <aside className="sidebar" data-testid="sidebar" aria-label="Channel navigation">
      <div className="sidebar-header">
        <h1 className="sidebar-title">AgentChat</h1>
      </div>

      {/* Tenant Switcher */}
      <div className="tenant-switcher">
        <label className="tenant-switcher-label" htmlFor="tenant-select">Workspace</label>
        <div className="tenant-switcher-row">
          <select
            id="tenant-select"
            className="tenant-select"
            value={selectedTenantId ?? ''}
            onChange={(e) => {
              if (e.target.value) onTenantSelect(e.target.value);
            }}
            disabled={tenantsLoading || tenants.length === 0}
          >
            {tenants.length === 0 && !tenantsLoading && (
              <option value="">No workspaces</option>
            )}
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          {selectedTenantId && (
            <button
              className="tenant-archive-btn"
              title="Archive tenant"
              aria-label={`Archive ${selectedTenant?.name ?? 'tenant'}`}
              onClick={() => {
                if (selectedTenant) {
                  setPendingArchive({ type: 'tenant', tenantId: selectedTenant.id, name: selectedTenant.name });
                }
              }}
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-content">
        {tenantsLoading && <div className="sidebar-loading">Loading tenants...</div>}
        {tenantsError && <div className="sidebar-error">{tenantsError}</div>}

        {/* Channel list for selected tenant */}
        {selectedTenantId && (
          <div className="channel-list">
            <div className="channel-list-header">
              <span>Channels</span>
              {hiddenStaleCount > 0 && (
                <button
                  className="stale-toggle-btn"
                  onClick={handleToggleStale}
                  title={showStale ? 'Hide stale channels' : `Show ${hiddenStaleCount} stale channel${hiddenStaleCount === 1 ? '' : 's'}`}
                  aria-label={showStale ? 'Hide stale channels' : `Show ${hiddenStaleCount} stale channels`}
                >
                  {showStale ? 'Hide stale' : `+${hiddenStaleCount} stale`}
                </button>
              )}
            </div>
            {channelsLoading && <div className="channel-loading">Loading...</div>}
            {visibleChannels.map((channel) => {
              const isStale = (channel as ChannelWithStale).stale;
              return (
                <div
                  key={channel.id}
                  className={`channel-item ${selectedChannelId === channel.id ? 'channel-item--active' : ''} ${isStale ? 'channel-item--stale' : ''}`}
                  onClick={() => onChannelSelect(selectedTenantId!, channel.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChannelSelect(selectedTenantId!, channel.id); } }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="channel-hash">#</span>
                  <span className="channel-name">{channel.name}</span>
                  <button
                    className="channel-archive-btn"
                    title="Archive channel"
                    aria-label={`Archive #${channel.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingArchive({ type: 'channel', tenantId: selectedTenantId!, channelId: channel.id, name: channel.name });
                    }}
                  >
                    &#x2715;
                  </button>
                </div>
              );
            })}
            {!channelsLoading && visibleChannels.length === 0 && hiddenStaleCount === 0 && (
              <div className="channel-empty">No channels</div>
            )}
            {!channelsLoading && visibleChannels.length === 0 && hiddenStaleCount > 0 && (
              <div className="channel-empty">All channels are stale</div>
            )}
          </div>
        )}

        {!tenantsLoading && !tenantsError && tenants.length === 0 && (
          <div className="sidebar-empty">No tenants found</div>
        )}
      </div>

      <ArchivedSection
        selectedTenantId={selectedTenantId}
        tenants={tenants}
        onRestoreChannel={onRestoreChannel}
        onRestoreTenant={onRestoreTenant}
        refreshKey={refreshKey}
      />

      {pendingArchive && (
        <ConfirmDialog
          open={true}
          title={pendingArchive.type === 'tenant' ? 'Archive Tenant' : 'Archive Channel'}
          message={
            pendingArchive.type === 'tenant'
              ? `Archive "${pendingArchive.name}" and all its channels?`
              : `Archive "#${pendingArchive.name}"?`
          }
          confirmLabel="Archive"
          onConfirm={() => {
            if (pendingArchive.type === 'tenant') {
              onArchiveTenant(pendingArchive.tenantId);
            } else if (pendingArchive.channelId) {
              onArchiveChannel(pendingArchive.tenantId, pendingArchive.channelId);
            }
            setPendingArchive(null);
          }}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </aside>
  );
}
