import React, { useRef, useEffect, useState } from 'react';
import type { FeedItem, FeedMessage } from '@agent-chat/shared';
import { MessageItem } from './MessageItem';

interface Props {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  teamMemberCount?: number;
}

export function MessageFeed({ items, loading, error, teamMemberCount }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setNewCount(0);
    } else {
      setNewCount(prev => prev + 1);
    }
  }, [items.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) setNewCount(0);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewCount(0);
  };

  return (
    <>
      <div
        className="message-feed"
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {loading && <div className="message-feed__loading">Loading messages...</div>}
        {error && <div className="message-feed__error">{error}</div>}

        {items.map((item, idx) => {
          const elements: React.ReactNode[] = [];

          const currentDate = new Date((item as FeedMessage).createdAt);
          const prevItem = idx > 0 ? items[idx - 1] : null;
          const prevDate = prevItem ? new Date((prevItem as FeedMessage).createdAt) : null;

          if (!prevDate || currentDate.toDateString() !== prevDate.toDateString()) {
            const label = currentDate.toDateString() === new Date().toDateString()
              ? 'Today'
              : currentDate.toDateString() === new Date(Date.now() - 86400000).toDateString()
                ? 'Yesterday'
                : currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            elements.push(
              <div key={`date-${item.id}`} className="date-separator">
                <span className="date-separator__label">{label}</span>
              </div>
            );
          }

          elements.push(<MessageItem key={item.id} message={item as FeedMessage} teamMemberCount={teamMemberCount} />);

          return elements;
        })}

        <div ref={endRef} />
      </div>

      {!isAtBottom && newCount > 0 && (
        <button className="new-messages-pill" onClick={scrollToBottom}>
          {newCount} new message{newCount > 1 ? 's' : ''} &#x2193;
        </button>
      )}
    </>
  );
}
