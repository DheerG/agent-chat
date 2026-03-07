import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

// Mock the API module
vi.mock('../lib/api', () => ({
  fetchTenants: vi.fn(),
  fetchChannels: vi.fn(),
}));

import { fetchTenants, fetchChannels } from '../lib/api';

const mockFetchTenants = vi.mocked(fetchTenants);
const mockFetchChannels = vi.mocked(fetchChannels);

const mockTenants = [
  { id: 'tenant-1', name: 'Project Alpha', codebasePath: '/alpha', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'tenant-2', name: 'Project Beta', codebasePath: '/beta', createdAt: '2026-01-01T00:00:00Z' },
];

const mockChannelsT1 = [
  { id: 'ch-1', tenantId: 'tenant-1', name: 'general', sessionId: null, type: 'manual' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'ch-2', tenantId: 'tenant-1', name: 'session-abc', sessionId: 'abc', type: 'session' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const mockChannelsT2 = [
  { id: 'ch-3', tenantId: 'tenant-2', name: 'dev', sessionId: null, type: 'manual' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTenants.mockResolvedValue(mockTenants);
  mockFetchChannels.mockImplementation(async (tenantId: string) => {
    if (tenantId === 'tenant-1') return mockChannelsT1;
    if (tenantId === 'tenant-2') return mockChannelsT2;
    return [];
  });
});

describe('Sidebar', () => {
  test('renders tenant names from fetched data', async () => {
    render(<Sidebar selectedChannelId={null} onChannelSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });
  });

  test('renders channels under each tenant', async () => {
    render(<Sidebar selectedChannelId={null} onChannelSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
      expect(screen.getByText('session-abc')).toBeInTheDocument();
      expect(screen.getByText('dev')).toBeInTheDocument();
    });
  });

  test('clicking a channel calls onChannelSelect with correct IDs', async () => {
    const onChannelSelect = vi.fn();
    render(<Sidebar selectedChannelId={null} onChannelSelect={onChannelSelect} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('general'));
    expect(onChannelSelect).toHaveBeenCalledWith('tenant-1', 'ch-1');
  });

  test('selected channel has active class', async () => {
    render(<Sidebar selectedChannelId="ch-1" onChannelSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('general')).toBeInTheDocument();
    });
    const channelButton = screen.getByText('general').closest('button');
    expect(channelButton).toHaveClass('channel-item--active');
  });

  test('shows loading state initially', () => {
    mockFetchTenants.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<Sidebar selectedChannelId={null} onChannelSelect={vi.fn()} />);
    expect(screen.getByText('Loading tenants...')).toBeInTheDocument();
  });

  test('renders app title', async () => {
    render(<Sidebar selectedChannelId={null} onChannelSelect={vi.fn()} />);
    expect(screen.getByText('AgentChat')).toBeInTheDocument();
  });
});
