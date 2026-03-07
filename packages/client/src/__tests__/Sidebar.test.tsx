import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

// Mock the API module
vi.mock('../lib/api', () => ({
  fetchTenants: vi.fn(),
  fetchChannels: vi.fn(),
  fetchArchivedTenants: vi.fn(),
  fetchArchivedChannels: vi.fn(),
}));

import { fetchTenants, fetchChannels, fetchArchivedTenants, fetchArchivedChannels } from '../lib/api';

const mockFetchTenants = vi.mocked(fetchTenants);
const mockFetchChannels = vi.mocked(fetchChannels);
const mockFetchArchivedTenants = vi.mocked(fetchArchivedTenants);
const mockFetchArchivedChannels = vi.mocked(fetchArchivedChannels);

const mockTenants = [
  { id: 'tenant-1', name: 'Project Alpha', codebasePath: '/alpha', createdAt: '2026-01-01T00:00:00Z', archivedAt: null },
  { id: 'tenant-2', name: 'Project Beta', codebasePath: '/beta', createdAt: '2026-01-01T00:00:00Z', archivedAt: null },
];

const mockChannelsT1 = [
  { id: 'ch-1', tenantId: 'tenant-1', name: 'general', sessionId: null, type: 'manual' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', archivedAt: null },
  { id: 'ch-2', tenantId: 'tenant-1', name: 'session-abc', sessionId: 'abc', type: 'session' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', archivedAt: null },
];

const mockChannelsT2 = [
  { id: 'ch-3', tenantId: 'tenant-2', name: 'dev', sessionId: null, type: 'manual' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', archivedAt: null },
];

const defaultProps = {
  selectedChannelId: null as string | null,
  onChannelSelect: vi.fn(),
  onArchiveChannel: vi.fn(),
  onArchiveTenant: vi.fn(),
  onRestoreChannel: vi.fn(),
  onRestoreTenant: vi.fn(),
  refreshKey: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTenants.mockResolvedValue(mockTenants);
  mockFetchChannels.mockImplementation(async (tenantId: string) => {
    if (tenantId === 'tenant-1') return mockChannelsT1;
    if (tenantId === 'tenant-2') return mockChannelsT2;
    return [];
  });
  mockFetchArchivedTenants.mockResolvedValue([]);
  mockFetchArchivedChannels.mockResolvedValue([]);
});

describe('Sidebar', () => {
  test('renders tenant names from fetched data', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });
  });

  test('renders channels under each tenant', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
      expect(screen.getByText('session-abc')).toBeInTheDocument();
      expect(screen.getByText('dev')).toBeInTheDocument();
    });
  });

  test('clicking a channel calls onChannelSelect with correct IDs', async () => {
    const onChannelSelect = vi.fn();
    render(<Sidebar {...defaultProps} onChannelSelect={onChannelSelect} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('general'));
    expect(onChannelSelect).toHaveBeenCalledWith('tenant-1', 'ch-1');
  });

  test('selected channel has active class', async () => {
    render(<Sidebar {...defaultProps} selectedChannelId="ch-1" />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    const channelItem = screen.getByText('general').closest('.channel-item');
    expect(channelItem).toHaveClass('channel-item--active');
  });

  test('shows loading state initially', () => {
    mockFetchTenants.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Loading tenants...')).toBeInTheDocument();
  });

  test('renders app title', async () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('AgentChat')).toBeInTheDocument();
  });

  test('sidebar has aria-label for accessibility', async () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-label', 'Channel navigation');
  });
});

describe('Sidebar archive/restore', () => {
  test('archive button appears on channel items', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    const archiveButtons = screen.getAllByTitle('Archive channel');
    expect(archiveButtons.length).toBeGreaterThan(0);
  });

  test('clicking channel archive button opens confirm dialog and calls onArchiveChannel', async () => {
    const onArchiveChannel = vi.fn();
    render(<Sidebar {...defaultProps} onArchiveChannel={onArchiveChannel} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    const archiveButtons = screen.getAllByTitle('Archive channel');
    fireEvent.click(archiveButtons[0]!);
    // ConfirmDialog should appear
    await waitFor(() => {
      expect(screen.getByText('Archive Channel')).toBeInTheDocument();
    });
    // Click confirm
    fireEvent.click(screen.getByText('Archive'));
    expect(onArchiveChannel).toHaveBeenCalledWith('tenant-1', 'ch-1');
  });

  test('archive button appears on tenant headers', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });
    const archiveButtons = screen.getAllByTitle('Archive tenant');
    expect(archiveButtons.length).toBeGreaterThan(0);
  });

  test('clicking tenant archive button opens confirm dialog and calls onArchiveTenant', async () => {
    const onArchiveTenant = vi.fn();
    render(<Sidebar {...defaultProps} onArchiveTenant={onArchiveTenant} />);
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });
    const archiveButtons = screen.getAllByTitle('Archive tenant');
    fireEvent.click(archiveButtons[0]!);
    // ConfirmDialog should appear
    await waitFor(() => {
      expect(screen.getByText('Archive Tenant')).toBeInTheDocument();
    });
    // Click confirm
    fireEvent.click(screen.getByText('Archive'));
    expect(onArchiveTenant).toHaveBeenCalledWith('tenant-1');
  });

  test('cancelling confirm dialog does not trigger archive', async () => {
    const onArchiveChannel = vi.fn();
    render(<Sidebar {...defaultProps} onArchiveChannel={onArchiveChannel} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    const archiveButtons = screen.getAllByTitle('Archive channel');
    fireEvent.click(archiveButtons[0]!);
    await waitFor(() => {
      expect(screen.getByText('Archive Channel')).toBeInTheDocument();
    });
    // Click cancel
    fireEvent.click(screen.getByText('Cancel'));
    expect(onArchiveChannel).not.toHaveBeenCalled();
    // Dialog should be gone
    expect(screen.queryByText('Archive Channel')).not.toBeInTheDocument();
  });

  test('archived section header is rendered', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
  });

  test('clicking restore in archived section calls onRestoreTenant', async () => {
    const archivedTenant = { id: 'archived-t', name: 'Old Project', codebasePath: '/old', createdAt: '2026-01-01T00:00:00Z', archivedAt: '2026-03-01T00:00:00Z' };
    mockFetchArchivedTenants.mockResolvedValue([archivedTenant]);
    mockFetchArchivedChannels.mockResolvedValue([]);

    const onRestoreTenant = vi.fn();
    render(<Sidebar {...defaultProps} onRestoreTenant={onRestoreTenant} />);

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    // Expand archived section
    fireEvent.click(screen.getByText('Archived'));

    await waitFor(() => {
      expect(screen.getByText('Old Project')).toBeInTheDocument();
    });

    const restoreBtn = screen.getByTitle('Restore tenant');
    fireEvent.click(restoreBtn);
    expect(onRestoreTenant).toHaveBeenCalledWith('archived-t');
  });

  test('clicking restore channel calls onRestoreChannel', async () => {
    const archivedChannel = { id: 'archived-ch', tenantId: 'tenant-1', name: 'old-channel', sessionId: null, type: 'manual' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', archivedAt: '2026-03-01T00:00:00Z' };
    mockFetchArchivedTenants.mockResolvedValue([]);
    mockFetchArchivedChannels.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'tenant-1') return [archivedChannel];
      return [];
    });

    const onRestoreChannel = vi.fn();
    render(<Sidebar {...defaultProps} onRestoreChannel={onRestoreChannel} />);

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    // Expand archived section
    fireEvent.click(screen.getByText('Archived'));

    await waitFor(() => {
      expect(screen.getByText('old-channel')).toBeInTheDocument();
    });

    const restoreBtn = screen.getByTitle('Restore channel');
    fireEvent.click(restoreBtn);
    expect(onRestoreChannel).toHaveBeenCalledWith('tenant-1', 'archived-ch');
  });
});
