import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { FeedMessage } from '@agent-chat/shared';

// Configure marked for safe inline rendering
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

interface IdleNotification {
  type: 'idle_notification';
  from: string;
  timestamp: string;
  idleReason?: string;
  summary?: string;
}

interface TaskEvent {
  type: 'task_assignment' | 'task_completed';
  taskId: string;
  subject?: string;
  description?: string;
  assignedBy?: string;
  assignedTo?: string;
  completedBy?: string;
  timestamp: string;
  result?: string;
}

function tryParseIdleNotification(content: string): IdleNotification | null {
  if (!content.startsWith('{"type":"idle_notification"')) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'idle_notification' && typeof parsed.from === 'string') {
      return parsed as IdleNotification;
    }
  } catch { /* not JSON */ }
  return null;
}

function tryParseTaskEvent(content: string): TaskEvent | null {
  if (!content.startsWith('{"type":"task_')) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'task_assignment' || parsed?.type === 'task_completed') {
      return parsed as TaskEvent;
    }
  } catch { /* not JSON */ }
  return null;
}

interface Props {
  message: FeedMessage;
}

export function MessageItem({ message }: Props) {
  const isSystem = message.senderType === 'system';
  const isError = message.messageType === 'error';
  const isStatus = message.messageType === 'status';
  const isInputRequest = message.messageType === 'input_request';
  const isHuman = message.senderType === 'human';

  const idleNotification = useMemo(
    () => tryParseIdleNotification(message.content),
    [message.content],
  );
  const taskEvent = useMemo(
    () => tryParseTaskEvent(message.content),
    [message.content],
  );
  const html = useMemo(
    () => (idleNotification || taskEvent ? '' : renderMarkdown(message.content)),
    [message.content, idleNotification, taskEvent],
  );

  // Also check metadata for server-classified idle notifications
  const metaIdle = !idleNotification && message.metadata?.original_type === 'idle_notification';

  if (taskEvent) {
    const isCompleted = taskEvent.type === 'task_completed';
    const actor = isCompleted
      ? (taskEvent.completedBy ?? message.senderName)
      : (taskEvent.assignedBy ?? message.senderName);

    return (
      <div className={`task-card ${isCompleted ? 'task-card--completed' : 'task-card--assigned'}`}>
        <div className="task-card__header">
          <span className="task-card__icon">{isCompleted ? '\u2705' : '\u{1F4CB}'}</span>
          <span className="task-card__label">
            {isCompleted ? 'Task completed' : 'Task assigned'}
          </span>
          <span className="task-card__id">#{taskEvent.taskId}</span>
          <span className="task-card__actor">
            {isCompleted ? `by ${actor}` : `from ${actor}`}
          </span>
          <span className="task-card__time">
            {new Date(taskEvent.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        {taskEvent.subject && (
          <div className="task-card__subject">{taskEvent.subject}</div>
        )}
        {taskEvent.description && !isCompleted && (
          <div className="task-card__description">{taskEvent.description}</div>
        )}
        {taskEvent.result && isCompleted && (
          <div className="task-card__description">{taskEvent.result}</div>
        )}
      </div>
    );
  }

  if (idleNotification || metaIdle) {
    const from = idleNotification?.from ?? message.senderName;
    const summary = idleNotification?.summary ?? (message.metadata?.summary as string | undefined);
    const ts = idleNotification?.timestamp ?? message.createdAt;
    const reason = idleNotification?.idleReason ?? (message.metadata?.idle_reason as string | undefined);

    return (
      <div className="idle-notification">
        <span className="idle-notification__dot" data-reason={reason ?? 'available'} />
        <span className="idle-notification__name">{from}</span>
        <span className="idle-notification__reason">
          {reason === 'available' || !reason ? 'is available' : reason}
        </span>
        {summary && <span className="idle-notification__summary">{summary}</span>}
        <span className="idle-notification__time">
          {new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="message-item message-item--system">
        <span className="message-item__system-text">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`message-item ${isHuman ? 'message-item--human' : ''} ${isError ? 'message-item--error' : ''} ${isInputRequest ? 'message-item--attention' : ''} ${isStatus ? 'message-item--status' : ''}`}>
      <div className="message-item__header">
        <span className={`message-item__avatar ${isHuman ? 'message-item__avatar--human' : ''}`}>
          {message.senderName.charAt(0).toUpperCase()}
        </span>
        <span className="message-item__sender">{message.senderName}</span>
        <span className="message-item__time">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="message-item__content">
        {isInputRequest && <span className="message-item__badge">Needs Input</span>}
        {isError && <span className="message-item__badge message-item__badge--error">Error</span>}
        {isStatus && <span className="message-item__badge message-item__badge--status">Status</span>}
        <div className="message-item__text" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
