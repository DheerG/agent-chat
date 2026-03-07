import { useState } from 'react';
import type { Message } from '@agent-chat/shared';
import './EventCard.css';

interface EventCardProps {
  message: Message;
}

export function EventCard({ message }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toolName = (message.metadata?.toolName as string) ?? 'Unknown Tool';
  const args = message.metadata?.arguments;
  const result = message.metadata?.result;

  return (
    <div className="event-card" data-testid="event-card">
      <button
        className="event-card-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="event-card-icon">&#9881;</span>
        <span className="event-card-tool-name">{toolName}</span>
        <span className={`event-card-chevron ${expanded ? 'event-card-chevron--expanded' : ''}`}>
          &#9656;
        </span>
      </button>
      {expanded && (
        <div className="event-card-body" data-testid="event-card-body">
          {args !== undefined && (
            <div className="event-card-section">
              <div className="event-card-label">Arguments</div>
              <pre className="event-card-json">
                {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div className="event-card-section">
              <div className="event-card-label">Result</div>
              <pre className="event-card-json">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {args === undefined && result === undefined && (
            <div className="event-card-section">
              <div className="event-card-label">Content</div>
              <pre className="event-card-json">{message.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
