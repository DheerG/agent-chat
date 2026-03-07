import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../App';
import type { Message } from '@agent-chat/shared';

// Mock all hooks
vi.mock('../hooks/usePresence', () => ({
  usePresence: vi.fn().mockReturnValue({
    presenceMap: new Map(),
    getStatus: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: vi.fn().mockReturnValue({
    messages: [],
    loading: false,
    error: null,
    sendMessage: vi.fn(),
    addMessage: vi.fn(),
    lastSeenId: undefined,
  }),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn().mockReturnValue({
    connected: true,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('../hooks/useTenants', () => ({
  useTenants: vi.fn().mockReturnValue({
    tenants: [
      { id: 'tenant-1', name: 'Test Workspace', createdAt: '2026-01-01T00:00:00Z' },
    ],
    loading: false,
    error: null,
  }),
}));

vi.mock('../hooks/useChannels', () => ({
  useChannels: vi.fn().mockReturnValue({
    channels: [
      { id: 'ch-1', tenantId: 'tenant-1', name: 'general', sessionId: null, type: 'manual', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ],
    loading: false,
    error: null,
  }),
}));

import { useMessages } from '../hooks/useMessages';

const mockUseMessages = vi.mocked(useMessages);

function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random()}`,
    channelId: 'ch-1',
    tenantId: 'tenant-1',
    parentMessageId: null,
    senderId: 'agent-1',
    senderName: 'Test Agent',
    senderType: 'agent',
    content: 'Test content',
    messageType: 'text',
    metadata: {},
    createdAt: '2026-03-07T12:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMessages.mockReturnValue({
    messages: [],
    loading: false,
    error: null,
    sendMessage: vi.fn(),
    addMessage: vi.fn(),
    lastSeenId: undefined,
  });
});

describe('App', () => {
  test('renders placeholder when no channel selected', () => {
    render(<App />);
    expect(screen.getByText('Select a channel to start')).toBeInTheDocument();
  });

  test('renders sidebar with tenants', () => {
    render(<App />);
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
  });

  test('renders message feed after selecting a channel', async () => {
    mockUseMessages.mockReturnValue({
      messages: [
        createMessage({ id: 'm1', content: 'Hello world' }),
      ],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: 'm1',
    });

    render(<App />);

    // Click the channel in sidebar
    const channelBtn = screen.getByText('general');
    fireEvent.click(channelBtn);

    await waitFor(() => {
      expect(screen.getByTestId('message-feed')).toBeInTheDocument();
    });
  });

  test('does not render thread panel when no thread selected', async () => {
    render(<App />);

    // Click channel first
    const channelBtn = screen.getByText('general');
    fireEvent.click(channelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
    });
  });
});
