import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageFeed } from '../components/MessageFeed';
import type { Message } from '@agent-chat/shared';

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

const defaultProps = {
  tenantId: 't1',
  channelId: 'ch-1',
  messages: [] as Message[],
  loading: false,
  error: null,
  onSend: vi.fn(),
};

describe('MessageFeed', () => {
  test('renders messages passed as props', () => {
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({ id: 'm1', content: 'First message', senderName: 'Agent One' }),
          createMessage({ id: 'm2', content: 'Second message', senderName: 'Agent Two' }),
        ]}
      />
    );
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  test('renders empty state when no messages', () => {
    render(<MessageFeed {...defaultProps} messages={[]} />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  test('renders loading state', () => {
    render(<MessageFeed {...defaultProps} loading={true} />);
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
  });

  test('renders different message types correctly', async () => {
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({ id: 'm1', content: 'Agent msg', senderType: 'agent', senderName: 'Bot' }),
          createMessage({ id: 'm2', content: 'Human msg', senderType: 'human', senderName: 'Human' }),
          createMessage({ id: 'm3', content: 'System msg', senderType: 'system', senderName: 'System' }),
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Agent msg')).toBeInTheDocument();
      expect(screen.getByText('Human msg')).toBeInTheDocument();
      expect(screen.getByText('System msg')).toBeInTheDocument();
    });
  });

  test('event messages render as EventCard', () => {
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({
            id: 'm1',
            messageType: 'event',
            senderType: 'hook',
            content: 'tool call',
            metadata: { toolName: 'Read', arguments: { file: 'test.ts' } },
          }),
        ]}
      />
    );
    expect(screen.getByTestId('event-card')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  test('ComposeInput is present', () => {
    render(<MessageFeed {...defaultProps} />);
    expect(screen.getByTestId('compose-input')).toBeInTheDocument();
  });

  test('message list has role="log" and aria-live for accessibility', () => {
    render(
      <MessageFeed
        {...defaultProps}
        messages={[createMessage({ id: 'm1', content: 'Test' })]}
      />
    );
    const messageList = screen.getByRole('log');
    expect(messageList).toHaveAttribute('aria-live', 'polite');
  });

  test('groups consecutive messages from same sender within 5 minutes', () => {
    const baseTime = new Date('2026-03-07T12:00:00Z').getTime();
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({ id: 'm1', content: 'First', senderId: 'agent-1', senderName: 'Bot', createdAt: new Date(baseTime).toISOString() }),
          createMessage({ id: 'm2', content: 'Second', senderId: 'agent-1', senderName: 'Bot', createdAt: new Date(baseTime + 60000).toISOString() }),
          createMessage({ id: 'm3', content: 'Third', senderId: 'agent-1', senderName: 'Bot', createdAt: new Date(baseTime + 120000).toISOString() }),
        ]}
      />
    );
    const items = screen.getAllByTestId('message-item');
    // First message is not grouped, second and third are
    expect(items[0]).not.toHaveClass('message-item--grouped');
    expect(items[1]).toHaveClass('message-item--grouped');
    expect(items[2]).toHaveClass('message-item--grouped');
  });

  test('does not group messages from different senders', () => {
    const baseTime = new Date('2026-03-07T12:00:00Z').getTime();
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({ id: 'm1', content: 'From A', senderId: 'agent-1', senderName: 'Bot A', createdAt: new Date(baseTime).toISOString() }),
          createMessage({ id: 'm2', content: 'From B', senderId: 'agent-2', senderName: 'Bot B', createdAt: new Date(baseTime + 60000).toISOString() }),
        ]}
      />
    );
    const items = screen.getAllByTestId('message-item');
    expect(items[0]).not.toHaveClass('message-item--grouped');
    expect(items[1]).not.toHaveClass('message-item--grouped');
  });

  test('renders date separators between messages from different days', () => {
    // Use dates far enough apart to be different local days regardless of timezone
    render(
      <MessageFeed
        {...defaultProps}
        messages={[
          createMessage({ id: 'm1', content: 'Day 1', createdAt: '2026-03-05T12:00:00Z' }),
          createMessage({ id: 'm2', content: 'Day 2', createdAt: '2026-03-07T12:00:00Z' }),
        ]}
      />
    );
    const separators = screen.getAllByTestId('date-separator');
    expect(separators.length).toBe(2); // One for first message, one for day change
  });

  test('shows new message indicator when messages arrive while scrolled up', async () => {
    const initialMessages = [
      createMessage({ id: 'm1', content: 'First message' }),
    ];
    const { rerender } = render(
      <MessageFeed {...defaultProps} messages={initialMessages} />
    );

    // Simulate being scrolled up: mock scroll properties so the scroll handler
    // computes isAtBottom = false. We need writable scrollTop for React effects too.
    const messageList = screen.getByRole('log');
    Object.defineProperty(messageList, 'scrollHeight', { value: 1000, configurable: true, writable: true });
    Object.defineProperty(messageList, 'scrollTop', { value: 0, configurable: true, writable: true });
    Object.defineProperty(messageList, 'clientHeight', { value: 400, configurable: true, writable: true });
    fireEvent.scroll(messageList);

    // Re-render with additional messages
    const updatedMessages = [
      ...initialMessages,
      createMessage({ id: 'm2', content: 'Second message' }),
      createMessage({ id: 'm3', content: 'Third message' }),
    ];
    rerender(<MessageFeed {...defaultProps} messages={updatedMessages} />);

    await waitFor(() => {
      expect(screen.getByText('2 new messages')).toBeInTheDocument();
    });
  });
});
