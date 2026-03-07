import { useState } from 'react';
import type { Message } from '@agent-chat/shared';
import './TeamEventCard.css';

interface TeamEventCardProps {
  message: Message;
}

export function TeamEventCard({ message }: TeamEventCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Determine event type: prefer metadata.original_type, fall back to parsed JSON .type
  const eventType = message.metadata?.original_type as string | undefined;

  // Parse content JSON
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const resolvedType = eventType ?? (parsed?.type as string | undefined);
  if (!resolvedType) return null;

  if (resolvedType === 'task_assignment') {
    const subject = (parsed?.subject as string) ?? '';
    const description = (parsed?.description as string) ?? '';
    const assignedBy = (parsed?.assignedBy as string) ?? '';

    return (
      <div className="team-event-card" data-testid="team-event-card">
        <div className="team-event-card__row">
          <span className="team-event-card__icon team-event-card__icon--task">&#9998;</span>
          <div className="team-event-card__content">
            <span className="team-event-card__primary">{subject}</span>
            <span className="team-event-card__secondary">Assigned by {assignedBy}</span>
          </div>
        </div>
        {description && (
          <button
            className="team-event-card__toggle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
        {expanded && description && (
          <div className="team-event-card__description">{description}</div>
        )}
      </div>
    );
  }

  if (resolvedType === 'shutdown_request') {
    const reason = (parsed?.reason as string) ?? '';
    const from = (parsed?.from as string) ?? '';

    return (
      <div className="team-event-card" data-testid="team-event-card">
        <div className="team-event-card__row">
          <span className="team-event-card__icon team-event-card__icon--stop">&#9632;</span>
          <div className="team-event-card__content">
            <span className="team-event-card__primary team-event-card__primary--semibold">
              Shutdown requested
            </span>
            <span className="team-event-card__secondary">{reason}</span>
            <span className="team-event-card__secondary team-event-card__secondary--muted">
              from {from}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (resolvedType === 'shutdown_approved') {
    const from = (parsed?.from as string) ?? '';

    return (
      <div className="team-event-card" data-testid="team-event-card">
        <div className="team-event-card__row">
          <span className="team-event-card__icon team-event-card__icon--check">&#10003;</span>
          <div className="team-event-card__content">
            <span className="team-event-card__primary team-event-card__primary--semibold">
              Shutdown approved
            </span>
            <span className="team-event-card__secondary team-event-card__secondary--muted">
              by {from}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Unknown event type — return null to fall through to EventCard
  return null;
}
