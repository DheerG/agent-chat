import { useState } from 'react';
import type { ConversationListItem, Session } from '@agent-chat/shared';
import { StatusIndicator } from './StatusIndicator';

interface Props {
  conversation: ConversationListItem;
  sessions: Session[];
}

function duration(startedAt: string | null): string {
  if (!startedAt) return '';
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const STATUS_ORDER: Record<string, number> = { active: 0, idle: 1, pending: 2, stopped: 3 };

export function ConversationHeader({ conversation, sessions }: Props) {
  const [compact, setCompact] = useState(false);
  const { summary } = conversation;
  const activeCount = sessions.filter(s => s.status === 'active' || s.status === 'idle').length;

  // Show all members, sorted: active → idle → pending → stopped
  const sortedSessions = [...sessions].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  if (compact) {
    return (
      <header className="conversation-header conversation-header--compact">
        <StatusIndicator status={conversation.status} />
        <span className="conversation-header__name">{conversation.name}</span>
        <span className="conversation-header__meta">
          {activeCount}/{sessions.length} agents active
          {summary.startedAt && ` | ${duration(summary.startedAt)}`}
        </span>
        <button className="conversation-header__toggle" onClick={() => setCompact(false)} title="Expand header">
          +
        </button>
      </header>
    );
  }

  return (
    <header className="conversation-header">
      <div className="conversation-header__top">
        <StatusIndicator status={conversation.status} size={12} />
        <h2 className="conversation-header__name">{conversation.name}</h2>
        {conversation.workspaceName && (
          <span className="conversation-header__workspace">{conversation.workspaceName}</span>
        )}
        <button className="conversation-header__toggle" onClick={() => setCompact(true)} title="Compact header">
          -
        </button>
      </div>

      <div className="conversation-header__status-bar">
        <span className="conversation-header__health">
          {activeCount}/{sessions.length} agents active
        </span>
        {summary.startedAt && (
          <span className="conversation-header__duration">
            Running {duration(summary.startedAt)}
          </span>
        )}
        <span className="conversation-header__msgs">
          {summary.totalMessages} messages
        </span>
        {summary.totalErrors > 0 && (
          <span className="conversation-header__errors">
            {summary.totalErrors} errors
          </span>
        )}
      </div>

      {sortedSessions.length > 0 && (
        <div className="conversation-header__agents">
          {sortedSessions.map(s => (
            <span
              key={s.id}
              className={`agent-pill agent-pill--${s.status}`}
              title={`${s.agentName ?? s.id.slice(0, 8)} (${s.status})`}
            >
              <StatusIndicator status={s.status} size={6} />
              {s.agentName ?? s.id.slice(0, 8)}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
