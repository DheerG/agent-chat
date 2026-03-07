import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamEventCard } from '../components/TeamEventCard';
import type { Message } from '@agent-chat/shared';

function createTeamEventMessage(
  originalType: string,
  content: Record<string, unknown>,
  overrides?: Partial<Message>,
): Message {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    tenantId: 'tenant-1',
    parentMessageId: null,
    senderId: 'hook-1',
    senderName: 'TeamInbox',
    senderType: 'hook',
    content: JSON.stringify(content),
    messageType: 'event',
    metadata: {
      source: 'team_inbox',
      original_type: originalType,
    },
    createdAt: '2026-03-07T12:00:00Z',
    ...overrides,
  };
}

describe('TeamEventCard', () => {
  test('has data-testid="team-event-card" on root element', () => {
    const msg = createTeamEventMessage('task_assignment', {
      type: 'task_assignment',
      taskId: 'task-1',
      subject: 'Fix login bug',
      description: 'The login page crashes on submit',
      assignedBy: 'alice',
      timestamp: '2026-03-07T12:00:00Z',
    });
    render(<TeamEventCard message={msg} />);
    expect(screen.getByTestId('team-event-card')).toBeInTheDocument();
  });

  describe('task_assignment', () => {
    const taskContent = {
      type: 'task_assignment',
      taskId: 'task-1',
      subject: 'Fix login bug',
      description: 'The login page crashes on submit when password is empty',
      assignedBy: 'alice',
      timestamp: '2026-03-07T12:00:00Z',
    };

    test('renders subject text', () => {
      const msg = createTeamEventMessage('task_assignment', taskContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    test('renders "Assigned by" label with agent name', () => {
      const msg = createTeamEventMessage('task_assignment', taskContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('Assigned by alice')).toBeInTheDocument();
    });

    test('description is hidden by default', () => {
      const msg = createTeamEventMessage('task_assignment', taskContent);
      render(<TeamEventCard message={msg} />);
      expect(
        screen.queryByText('The login page crashes on submit when password is empty'),
      ).not.toBeInTheDocument();
    });

    test('clicking "Show details" reveals description', () => {
      const msg = createTeamEventMessage('task_assignment', taskContent);
      render(<TeamEventCard message={msg} />);
      fireEvent.click(screen.getByText('Show details'));
      expect(
        screen.getByText('The login page crashes on submit when password is empty'),
      ).toBeInTheDocument();
    });

    test('clicking "Hide details" after expanding hides description', () => {
      const msg = createTeamEventMessage('task_assignment', taskContent);
      render(<TeamEventCard message={msg} />);
      fireEvent.click(screen.getByText('Show details'));
      fireEvent.click(screen.getByText('Hide details'));
      expect(
        screen.queryByText('The login page crashes on submit when password is empty'),
      ).not.toBeInTheDocument();
    });
  });

  describe('shutdown_request', () => {
    const shutdownContent = {
      type: 'shutdown_request',
      requestId: 'req-1',
      from: 'bob',
      reason: 'Maintenance window starting',
      timestamp: '2026-03-07T12:00:00Z',
    };

    test('renders "Shutdown requested" label', () => {
      const msg = createTeamEventMessage('shutdown_request', shutdownContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('Shutdown requested')).toBeInTheDocument();
    });

    test('renders reason text', () => {
      const msg = createTeamEventMessage('shutdown_request', shutdownContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('Maintenance window starting')).toBeInTheDocument();
    });

    test('renders "from" agent name', () => {
      const msg = createTeamEventMessage('shutdown_request', shutdownContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('from bob')).toBeInTheDocument();
    });
  });

  describe('shutdown_approved', () => {
    const approvedContent = {
      type: 'shutdown_approved',
      requestId: 'req-1',
      from: 'charlie',
      timestamp: '2026-03-07T12:00:00Z',
    };

    test('renders "Shutdown approved" label', () => {
      const msg = createTeamEventMessage('shutdown_approved', approvedContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('Shutdown approved')).toBeInTheDocument();
    });

    test('renders "by" agent name', () => {
      const msg = createTeamEventMessage('shutdown_approved', approvedContent);
      render(<TeamEventCard message={msg} />);
      expect(screen.getByText('by charlie')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    test('gracefully handles malformed JSON content (renders nothing)', () => {
      const msg = createTeamEventMessage('task_assignment', {} as Record<string, unknown>, {
        content: 'not valid json {{{',
      });
      const { container } = render(<TeamEventCard message={msg} />);
      expect(container.innerHTML).toBe('');
    });

    test('returns null for unknown event type', () => {
      const msg = createTeamEventMessage('unknown_type', { type: 'unknown_type' });
      const { container } = render(<TeamEventCard message={msg} />);
      expect(container.innerHTML).toBe('');
    });

    test('uses metadata.original_type over parsed JSON type', () => {
      const msg = createTeamEventMessage('shutdown_approved', {
        type: 'task_assignment',
        requestId: 'req-1',
        from: 'dave',
        timestamp: '2026-03-07T12:00:00Z',
      });
      render(<TeamEventCard message={msg} />);
      // Should render as shutdown_approved (from metadata), not task_assignment (from JSON)
      expect(screen.getByText('Shutdown approved')).toBeInTheDocument();
      expect(screen.getByText('by dave')).toBeInTheDocument();
    });
  });
});
