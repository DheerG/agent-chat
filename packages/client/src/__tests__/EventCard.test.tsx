import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventCard } from '../components/EventCard';
import type { Message } from '@agent-chat/shared';

function createEventMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    tenantId: 'tenant-1',
    parentMessageId: null,
    senderId: 'hook-1',
    senderName: 'Claude Code',
    senderType: 'hook',
    content: 'Tool call',
    messageType: 'event',
    metadata: {
      toolName: 'Read',
      arguments: { file: 'src/main.ts' },
      result: 'File contents...',
    },
    createdAt: '2026-03-07T12:00:00Z',
    ...overrides,
  };
}

describe('EventCard', () => {
  test('renders tool name when collapsed', () => {
    render(<EventCard message={createEventMessage()} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  test('does not show arguments when collapsed', () => {
    render(<EventCard message={createEventMessage()} />);
    expect(screen.queryByTestId('event-card-body')).not.toBeInTheDocument();
  });

  test('click expands to show tool arguments', () => {
    render(<EventCard message={createEventMessage()} />);
    fireEvent.click(screen.getByText('Read'));
    expect(screen.getByTestId('event-card-body')).toBeInTheDocument();
    expect(screen.getByText('Arguments')).toBeInTheDocument();
  });

  test('shows result if metadata.result exists', () => {
    render(<EventCard message={createEventMessage()} />);
    fireEvent.click(screen.getByText('Read'));
    expect(screen.getByText('Result')).toBeInTheDocument();
  });

  test('has distinct visual class', () => {
    render(<EventCard message={createEventMessage()} />);
    expect(screen.getByTestId('event-card')).toHaveClass('event-card');
  });

  test('renders without result when not provided', () => {
    const msg = createEventMessage({
      metadata: { toolName: 'Write', arguments: { path: 'file.ts' } },
    });
    render(<EventCard message={msg} />);
    fireEvent.click(screen.getByText('Write'));
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });
});
