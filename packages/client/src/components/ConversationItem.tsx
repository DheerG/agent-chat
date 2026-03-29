import type { ConversationListItem } from '@agent-chat/shared';
import { StatusIndicator } from './StatusIndicator';

interface Props {
  conversation: ConversationListItem;
  isSelected: boolean;
  compact?: boolean;
  unreadCount?: number;
  onClick: () => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ConversationItem({ conversation, isSelected, compact, unreadCount, onClick }: Props) {
  const { summary } = conversation;
  const lastActivity = summary.lastMessageAt ?? summary.lastEventAt;
  const agentCount = summary.totalSessionCount;

  return (
    <div
      className={`conversation-item ${isSelected ? 'conversation-item--selected' : ''}`}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <StatusIndicator status={conversation.status} />
      <div className="conversation-item__content">
        <div className="conversation-item__line1">
          <span className="conversation-item__name">{conversation.name}</span>
          {conversation.type === 'team' && agentCount > 0 && (
            <span className="conversation-item__agents">({agentCount})</span>
          )}
          <span className="conversation-item__time">{timeAgo(lastActivity)}</span>
        </div>
        {!compact && (
          <div className="conversation-item__line2">
            {conversation.workspaceName && (
              <span className="conversation-item__workspace">{conversation.workspaceName}</span>
            )}
            {summary.totalMessages > 0 && (
              <span className="conversation-item__stat">{summary.totalMessages} msgs</span>
            )}
            {summary.totalErrors > 0 && (
              <span className="conversation-item__stat conversation-item__stat--error">{summary.totalErrors} errors</span>
            )}
          </div>
        )}
      </div>
      {(unreadCount ?? 0) > 0 && !conversation.attentionNeeded && (
        <span className="conversation-item__unread">{unreadCount}</span>
      )}
      {conversation.attentionNeeded && (
        <span className="conversation-item__attention" title="Needs your attention">!</span>
      )}
    </div>
  );
}
