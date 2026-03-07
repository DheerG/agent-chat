import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
