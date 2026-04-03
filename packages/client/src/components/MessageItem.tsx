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

// ─── Structured JSON event detection ────────────────────────────

interface JsonEvent {
  type: string;
  from?: string;
  timestamp?: string;
  [key: string]: unknown;
}

function tryParseJsonEvent(content: string): JsonEvent | null {
  if (!content.startsWith('{"type":"')) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.type === 'string') return parsed as JsonEvent;
  } catch { /* not JSON */ }
  return null;
}

/** Convert snake_case type to a readable label: "shutdown_approved" → "Shutdown approved" */
function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Fields to hide from the generic detail row — noisy internals */
const HIDDEN_FIELDS = new Set([
  'type', 'from', 'timestamp', 'requestId', 'paneId', 'backendType',
  // task-specific (rendered in their own card)
  'taskId', 'subject', 'description', 'assignedBy', 'assignedTo', 'completedBy', 'result',
  // idle-specific
  'idleReason', 'summary',
]);

interface Props {
  message: FeedMessage;
}

export function MessageItem({ message }: Props) {
  const isSystem = message.senderType === 'system';
  const isError = message.messageType === 'error';
  const isStatus = message.messageType === 'status';
  const isInputRequest = message.messageType === 'input_request';
  const isHuman = message.senderType === 'human';

  const jsonEvent = useMemo(
    () => tryParseJsonEvent(message.content),
    [message.content],
  );
  const html = useMemo(
    () => (jsonEvent ? '' : renderMarkdown(message.content)),
    [message.content, jsonEvent],
  );

  // Also check metadata for server-classified structured events
  const metaType = !jsonEvent ? (message.metadata?.original_type as string | undefined) : undefined;

  // ─── Idle notification ────────────────────────────────────────
  if (jsonEvent?.type === 'idle_notification' || metaType === 'idle_notification') {
    const from = jsonEvent?.from ?? message.senderName;
    const summary = (jsonEvent?.summary ?? message.metadata?.summary) as string | undefined;
    const ts = jsonEvent?.timestamp ?? message.createdAt;
    const reason = (jsonEvent?.idleReason ?? message.metadata?.idle_reason) as string | undefined;

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

  // ─── Task assignment / completion ─────────────────────────────
  if (jsonEvent?.type === 'task_assignment' || jsonEvent?.type === 'task_completed'
      || metaType === 'task_assignment' || metaType === 'task_completed') {
    const ev = jsonEvent;
    const isCompleted = (ev?.type ?? metaType) === 'task_completed';
    const actor = isCompleted
      ? ((ev?.completedBy as string) ?? message.senderName)
      : ((ev?.assignedBy as string) ?? message.senderName);
    const taskId = (ev?.taskId as string) ?? (message.metadata?.task_id as string);

    return (
      <div className={`task-card ${isCompleted ? 'task-card--completed' : 'task-card--assigned'}`}>
        <div className="task-card__header">
          <span className="task-card__icon">{isCompleted ? '\u2705' : '\u{1F4CB}'}</span>
          <span className="task-card__label">
            {isCompleted ? 'Task completed' : 'Task assigned'}
          </span>
          {taskId && <span className="task-card__id">#{taskId}</span>}
          <span className="task-card__actor">
            {isCompleted ? `by ${actor}` : `from ${actor}`}
          </span>
          <span className="task-card__time">
            {new Date(ev?.timestamp ?? message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        {ev?.subject ? (
          <div className="task-card__subject">{String(ev.subject)}</div>
        ) : null}
        {ev?.description && !isCompleted ? (
          <div className="task-card__description">{String(ev.description)}</div>
        ) : null}
        {ev?.result && isCompleted ? (
          <div className="task-card__description">{String(ev.result)}</div>
        ) : null}
      </div>
    );
  }

  // ─── Generic JSON event fallback ──────────────────────────────
  if (jsonEvent) {
    const from = jsonEvent.from ?? message.senderName;
    const ts = jsonEvent.timestamp ?? message.createdAt;
    // Collect visible detail fields
    const details = Object.entries(jsonEvent)
      .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v != null && v !== '')
      .map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().trim(), String(v)] as const);

    return (
      <div className="json-event">
        <div className="json-event__header">
          <span className="json-event__label">{formatEventType(jsonEvent.type)}</span>
          {from && <span className="json-event__from">{from as string}</span>}
          {details.length > 0 && (
            <span className="json-event__details">
              {details.map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </span>
          )}
          <span className="json-event__time">
            {new Date(ts as string).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
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
