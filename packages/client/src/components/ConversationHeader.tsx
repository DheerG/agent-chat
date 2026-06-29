import { useState } from 'react';
import type { ConversationListItem, Session, MemberCoverage } from '@agent-chat/shared';
import { StatusIndicator } from './StatusIndicator';
import { FeedFilter } from './FeedFilter';
import { type FeedCategory } from '../hooks/useFeedFilters';

interface Props {
  conversation: ConversationListItem;
  sessions: Session[];
  coverage?: MemberCoverage[];
  messageCounts?: Record<string, number>;
  hiddenCategories?: Set<FeedCategory>;
  onToggleCategory?: (cat: FeedCategory) => void;
}

function duration(startedAt: string | null): string {
  if (!startedAt) return '';
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Completeness signal: are all member transcripts caught up? A member whose
 * captured byte offset trails its file size is still being read. This is the
 * anti-false-trust indicator — completeness is observable, not assumed.
 */
function coverageState(coverage: MemberCoverage[], memberCount: number): { caughtUp: number; total: number; behind: string[] } {
  // The denominator is the full roster, not just members whose transcript has
  // appeared — otherwise a member with no tailed transcript yet is silently
  // excluded and the header reports "live (k/k)" while still missing them.
  const total = Math.max(memberCount, coverage.length);
  const caughtUp = coverage.filter(c => c.fileSize - c.byteOffset <= 0).length;
  const behind = coverage.filter(c => c.fileSize - c.byteOffset > 0).map(c => c.ownerName);
  return { caughtUp, total, behind };
}

const STATUS_ORDER: Record<string, number> = { active: 0, idle: 1, pending: 2, stopped: 3 };

export function ConversationHeader({ conversation, sessions, coverage = [], messageCounts = {}, hiddenCategories, onToggleCategory }: Props) {
  const [compact, setCompact] = useState(false);
  const { summary } = conversation;
  const activeCount = sessions.filter(s => s.status === 'active' || s.status === 'idle').length;
  const cov = coverageState(coverage, sessions.length);
  // Class-separated counts, each a click-to-toggle filter — lead narration alone
  // is the bulk of a feed, so hiding it (or status / your own input) cuts the
  // noise without losing the inter-agent discussion. Filtering is purely
  // presentational; the counts remain the full totals.
  const hasCounts = Object.keys(messageCounts).length > 0;

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
        {hasCounts && onToggleCategory ? (
          <FeedFilter
            counts={messageCounts}
            hidden={hiddenCategories ?? new Set<FeedCategory>()}
            onToggle={onToggleCategory}
          />
        ) : (
          <span className="conversation-header__msgs">
            {summary.totalMessages} messages
          </span>
        )}
        {cov.total > 0 && (() => {
          const live = cov.caughtUp >= cov.total;
          const untracked = cov.total - cov.caughtUp - cov.behind.length;
          const lagging = [
            ...cov.behind,
            ...(untracked > 0 ? [`${untracked} not yet tailed`] : []),
          ];
          return (
            <span
              className={`conversation-header__coverage conversation-header__coverage--${live ? 'live' : 'lagging'}`}
              title={
                live
                  ? `Capture is up to date across all ${cov.total} member transcripts`
                  : `Catching up on: ${lagging.join(', ')}`
              }
            >
              <StatusIndicator status={live ? 'active' : 'pending'} size={6} />
              {live ? `capture live (${cov.total}/${cov.total})` : `capturing ${cov.caughtUp}/${cov.total}`}
            </span>
          );
        })()}
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
