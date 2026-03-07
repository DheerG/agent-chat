import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadPanel } from '../components/ThreadPanel';
import type { Message } from '@agent-chat/shared';

// Mock useMessages hook
vi.mock('../hooks/useMessages', () => ({
  useMessages: vi.fn().mockReturnValue({
    sendMessage: vi.fn(),
    messages: [],
    loading: false,
    error: null,
    addMessage: vi.fn(),
    lastSeenId: undefined,
  }),
}));

import { useMessages } from '../hooks/useMessages';

const mockUseMessages = vi.mocked(useMessages);

function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-parent',
    channelId: 'ch-1',
    tenantId: 'tenant-1',
    parentMessageId: null,
    senderId: 'agent-1',
    senderName: 'Test Agent',
    senderType: 'agent',
    content: 'Parent message content',
    messageType: 'text',
    metadata: {},
    createdAt: '2026-03-07T12:00:00Z',
    ...overrides,
  };
}

const parentMessage = createMessage({ id: 'parent-1', content: 'This is the parent' });

const defaultProps = {
  tenantId: 'tenant-1',
  channelId: 'ch-1',
  parentMessage,
  allMessages: [parentMessage],
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMessages.mockReturnValue({
    sendMessage: vi.fn(),
    messages: [],
    loading: false,
    error: null,
    addMessage: vi.fn(),
    lastSeenId: undefined,
  });
});

describe('ThreadPanel', () => {
  test('renders with parent message and thread title', () => {
    render(<ThreadPanel {...defaultProps} />);
    expect(screen.getByText('Thread')).toBeInTheDocument();
    expect(screen.getByText('This is the parent')).toBeInTheDocument();
  });

  test('shows "No replies yet" when there are no replies', () => {
    render(<ThreadPanel {...defaultProps} />);
    expect(screen.getByText('No replies yet')).toBeInTheDocument();
    expect(screen.getByText('0 replies')).toBeInTheDocument();
  });

  test('renders replies filtered from allMessages', () => {
    const reply1 = createMessage({
      id: 'reply-1',
      parentMessageId: 'parent-1',
      content: 'First reply',
      senderName: 'Replier One',
    });
    const reply2 = createMessage({
      id: 'reply-2',
      parentMessageId: 'parent-1',
      content: 'Second reply',
      senderName: 'Replier Two',
    });
    const unrelated = createMessage({
      id: 'other-1',
      parentMessageId: 'parent-99',
      content: 'Unrelated reply',
    });

    render(
      <ThreadPanel
        {...defaultProps}
        allMessages={[parentMessage, reply1, reply2, unrelated]}
      />
    );
    expect(screen.getByText('First reply')).toBeInTheDocument();
    expect(screen.getByText('Second reply')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated reply')).not.toBeInTheDocument();
    expect(screen.getByText('2 replies')).toBeInTheDocument();
  });

  test('singular "reply" text for single reply', () => {
    const reply = createMessage({
      id: 'reply-1',
      parentMessageId: 'parent-1',
      content: 'Only reply',
    });

    render(
      <ThreadPanel
        {...defaultProps}
        allMessages={[parentMessage, reply]}
      />
    );
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ThreadPanel {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByLabelText('Close thread');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('has compose input for thread replies', () => {
    render(<ThreadPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText('Reply in thread...')).toBeInTheDocument();
  });

  test('passes presence status to message items', () => {
    const getPresenceStatus = vi.fn().mockReturnValue('active');
    render(
      <ThreadPanel
        {...defaultProps}
        getPresenceStatus={getPresenceStatus}
      />
    );
    // Parent message is agent type, so getPresenceStatus should be called
    expect(getPresenceStatus).toHaveBeenCalledWith('agent-1');
  });
});
