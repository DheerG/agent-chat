import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MessageFeed } from '../components/MessageFeed';
import type { Message } from '@agent-chat/shared';

// Mock the hooks
vi.mock('../hooks/useMessages', () => ({
  useMessages: vi.fn(),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

import { useMessages } from '../hooks/useMessages';
import { useWebSocket } from '../hooks/useWebSocket';

const mockUseMessages = vi.mocked(useMessages);
const mockUseWebSocket = vi.mocked(useWebSocket);

function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random()}`,
    channelId: 'ch-1',
    tenantId: 'tenant-1',
    parentMessageId: null,
    senderId: 'agent-1',
    senderName: 'Test Agent',
    senderType: 'agent',
    content: 'Hello from agent',
    messageType: 'text',
    metadata: {},
    createdAt: '2026-03-07T12:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseWebSocket.mockReturnValue({
    connected: true,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  });
});

describe('MessageFeed', () => {
  test('renders messages from useMessages', () => {
    mockUseMessages.mockReturnValue({
      messages: [
        createMessage({ id: 'm1', content: 'First message', senderName: 'Agent One' }),
        createMessage({ id: 'm2', content: 'Second message', senderName: 'Agent Two' }),
      ],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: 'm2',
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  test('renders empty state when no messages', () => {
    mockUseMessages.mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: undefined,
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  test('renders loading state', () => {
    mockUseMessages.mockReturnValue({
      messages: [],
      loading: true,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: undefined,
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
  });

  test('renders different message types correctly', async () => {
    mockUseMessages.mockReturnValue({
      messages: [
        createMessage({ id: 'm1', content: 'Agent msg', senderType: 'agent', senderName: 'Bot' }),
        createMessage({ id: 'm2', content: 'Human msg', senderType: 'human', senderName: 'Human' }),
        createMessage({ id: 'm3', content: 'System msg', senderType: 'system', senderName: 'System' }),
      ],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: 'm3',
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    await waitFor(() => {
      expect(screen.getByText('Agent msg')).toBeInTheDocument();
      expect(screen.getByText('Human msg')).toBeInTheDocument();
      expect(screen.getByText('System msg')).toBeInTheDocument();
    });
  });

  test('event messages render as EventCard', () => {
    mockUseMessages.mockReturnValue({
      messages: [
        createMessage({
          id: 'm1',
          messageType: 'event',
          senderType: 'hook',
          content: 'tool call',
          metadata: { toolName: 'Read', arguments: { file: 'test.ts' } },
        }),
      ],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: 'm1',
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    expect(screen.getByTestId('event-card')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  test('ComposeInput is present', () => {
    mockUseMessages.mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      lastSeenId: undefined,
    });

    render(<MessageFeed tenantId="t1" channelId="ch-1" />);
    expect(screen.getByTestId('compose-input')).toBeInTheDocument();
  });
});
