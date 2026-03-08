import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Message } from '@agent-chat/shared';
import { MessageItem } from './MessageItem';
import { ComposeInput } from './ComposeInput';
import './MessageFeed.css';

interface MessageFeedProps {
  tenantId: string;
  channelId: string;
  messages: Message[];
  loading: boolean;
  error: string | null;
  onSend: (content: string) => void;
  lastSeenId?: string;
  getPresenceStatus?: (agentId: string) => 'active' | 'idle' | null;
  onThreadOpen?: (parentMessage: Message) => void;
}

function formatDateSeparator(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function MessageFeed(props: MessageFeedProps) {
  const { channelId, messages, loading, error, onSend, getPresenceStatus, onThreadOpen } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const prevMessageCount = useRef(messages.length);

  // Auto-scroll management
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setNewCount(0);
    }
  }, []);

  // Auto-scroll to bottom on new messages (only if already at bottom)
  useEffect(() => {
    if (isAtBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, isAtBottom]);

  // Scroll to bottom on initial load and channel change
  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsAtBottom(true);
      setNewCount(0);
      prevMessageCount.current = messages.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, channelId]);

  // Track new messages arriving while scrolled up
  useEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCount.current;
    if (currentCount > prevCount && !isAtBottom) {
      setNewCount((n) => n + (currentCount - prevCount));
    }
    prevMessageCount.current = currentCount;
  }, [messages.length, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsAtBottom(true);
      setNewCount(0);
    }
  }, []);

  const handleSend = useCallback((content: string) => {
    onSend(content);
  }, [onSend]);

  // Count thread replies for each top-level message
  const threadReplyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const msg of messages) {
      if (msg.parentMessageId) {
        counts.set(msg.parentMessageId, (counts.get(msg.parentMessageId) ?? 0) + 1);
      }
    }
    return counts;
  }, [messages]);

  // Filter top-level messages (no parentMessageId)
  const topLevelMessages = useMemo(() => {
    return messages.filter((m) => !m.parentMessageId);
  }, [messages]);

  // Compute message grouping and date separators
  const groupedMessages = useMemo(() => {
    return topLevelMessages.map((msg, i) => {
      if (i === 0) {
        return { message: msg, isGrouped: false, showDateSeparator: true };
      }
      const prev = topLevelMessages[i - 1]!;
      const sameSender = msg.senderId === prev.senderId;
      const timeDiff = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
      const within5Min = timeDiff < 5 * 60 * 1000;
      const sameType = msg.senderType === prev.senderType;
      const isGroupable = sameSender && sameType && within5Min && msg.senderType !== 'system';

      // Date separator: show if the day changes
      const msgDate = new Date(msg.createdAt).toDateString();
      const prevDate = new Date(prev.createdAt).toDateString();
      const showDateSeparator = msgDate !== prevDate;

      // Don't group if a date separator breaks the flow
      return { message: msg, isGrouped: isGroupable && !showDateSeparator, showDateSeparator };
    });
  }, [topLevelMessages]);

  if (loading) {
    return (
      <div className="message-feed" data-testid="message-feed">
        <div className="message-feed-loading">Loading messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="message-feed" data-testid="message-feed">
        <div className="message-feed-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="message-feed" data-testid="message-feed">
      <div className="message-list" ref={listRef} onScroll={handleScroll} role="log" aria-live="polite">
        {topLevelMessages.length === 0 && (
          <div className="message-feed-empty">No messages yet</div>
        )}
        {groupedMessages.map(({ message: msg, isGrouped, showDateSeparator }) => (
          <React.Fragment key={msg.id}>
            {showDateSeparator && (
              <div className="date-separator" data-testid="date-separator">
                <span className="date-separator-text">{formatDateSeparator(msg.createdAt)}</span>
              </div>
            )}
            <MessageItem
              message={msg}
              isGrouped={isGrouped}
              presenceStatus={msg.senderType === 'agent' ? getPresenceStatus?.(msg.senderId) ?? null : null}
              threadReplyCount={threadReplyCounts.get(msg.id)}
              onThreadOpen={onThreadOpen}
            />
          </React.Fragment>
        ))}
      </div>
      {newCount > 0 && (
        <button className="new-message-indicator" onClick={scrollToBottom}>
          {newCount} new {newCount === 1 ? 'message' : 'messages'}
        </button>
      )}
      <ComposeInput onSend={handleSend} />
    </div>
  );
}
