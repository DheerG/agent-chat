import { useState } from 'react';
import type { FeedEventBatch } from '@agent-chat/shared';
import { fetchEvents } from '../lib/api';

interface Props {
  batch: FeedEventBatch;
}

interface EventDetail {
  id: string;
  eventType: string;
  toolName: string | null;
  summary: string | null;
  isError: boolean;
  createdAt: string;
}

export function EventBatch({ batch }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (events.length > 0) return;

    setLoading(true);
    try {
      const data = await fetchEvents(batch.conversationId, {
        after: batch.firstEventId,
        before: batch.lastEventId,
        limit: batch.count + 10,
      });
      setEvents(data.events);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className={`event-batch ${batch.errorCount > 0 ? 'event-batch--has-errors' : ''}`}>
      <div
        className="event-batch__summary"
        onClick={handleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleExpand(); }}
        aria-expanded={expanded}
      >
        <span className="event-batch__icon">&#9881;</span>
        <span className="event-batch__count">{batch.count} tool calls</span>
        <span className="event-batch__tools">
          {batch.toolNames.slice(0, 5).join(', ')}
          {batch.toolNames.length > 5 && `, +${batch.toolNames.length - 5}`}
        </span>
        {batch.errorCount > 0 && (
          <span className="event-batch__errors">{batch.errorCount} errors</span>
        )}
        <span className="event-batch__expand">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="event-batch__details">
          {loading && <div className="event-batch__loading">Loading...</div>}
          {events.map(ev => (
            <div key={ev.id} className={`event-detail ${ev.isError ? 'event-detail--error' : ''}`}>
              <span className="event-detail__tool">{ev.toolName ?? ev.eventType}</span>
              {ev.summary && <span className="event-detail__summary">{ev.summary}</span>}
              <span className="event-detail__time">
                {new Date(ev.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
