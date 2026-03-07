import type { Message } from '@agent-chat/shared';
import { EventCard } from './EventCard';
import { MessageContent } from './MessageContent';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
  presenceStatus?: 'active' | 'idle' | null;
  threadReplyCount?: number;
  onThreadOpen?: (parentMessage: Message) => void;
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#667eea', '#48bb78', '#ed8936', '#e53e3e', '#9f7aea', '#38b2ac', '#dd6b20', '#d53f8c'];
  return colors[Math.abs(hash) % colors.length]!;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function MessageItem({ message, presenceStatus, threadReplyCount, onThreadOpen }: MessageItemProps) {
  // System messages — centered, muted
  if (message.senderType === 'system') {
    return (
      <div className="message-item message-item--system" data-testid="message-item">
        <span className="message-system-text">{message.content}</span>
      </div>
    );
  }

  // Event messages — render as collapsible card
  if (message.messageType === 'event' || message.messageType === 'hook') {
    return <EventCard message={message} />;
  }

  // Regular messages (agent or human)
  const isHuman = message.senderType === 'human';

  return (
    <div className={`message-item ${isHuman ? 'message-item--human' : 'message-item--agent'}`} data-testid="message-item">
      <div
        className="message-avatar"
        style={{ backgroundColor: getAvatarColor(message.senderName) }}
      >
        {getInitials(message.senderName)}
      </div>
      <div className="message-content">
        <div className="message-header">
          <span className="message-sender-name">
            {presenceStatus && message.senderType === 'agent' && (
              <span
                className={`presence-dot ${presenceStatus === 'active' ? 'presence-dot--active' : 'presence-dot--idle'}`}
                data-testid="presence-dot"
                title={presenceStatus}
              />
            )}
            {message.senderName}
          </span>
          <span className="message-timestamp">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <div className="message-text"><MessageContent content={message.content} /></div>
        {threadReplyCount !== undefined && threadReplyCount > 0 && (
          <button
            className="message-thread-link"
            onClick={() => onThreadOpen?.(message)}
            data-testid="thread-link"
          >
            {threadReplyCount} {threadReplyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
    </div>
  );
}
