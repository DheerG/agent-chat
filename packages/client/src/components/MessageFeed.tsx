import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Message } from '@agent-chat/shared';
import { useMessages } from '../hooks/useMessages';
import { useWebSocket } from '../hooks/useWebSocket';
import { MessageItem } from './MessageItem';
import { ComposeInput } from './ComposeInput';
import './MessageFeed.css';

interface MessageFeedProps {
  tenantId: string;
  channelId: string;
  getPresenceStatus?: (agentId: string) => 'active' | 'idle' | null;
  onThreadOpen?: (parentMessage: Message) => void;
}

export function MessageFeed({ tenantId, channelId, getPresenceStatus, onThreadOpen }: MessageFeedProps) {
  const { messages, loading, error, sendMessage, addMessage, lastSeenId } = useMessages(tenantId, channelId);
  const listRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  // WebSocket — subscribe to channel and route messages
  const handleWsMessage = useCallback((msg: Message) => {
    if (msg.channelId === channelId) {
      addMessage(msg);
      if (!isAtBottom) {
        setNewCount((c) => c + 1);
      }
    }
  }, [channelId, addMessage, isAtBottom]);

  const { subscribe, unsubscribe } = useWebSocket(tenantId, handleWsMessage);

  useEffect(() => {
    subscribe(channelId, lastSeenId);
    return () => { unsubscribe(channelId); };
    // Only re-subscribe when channel changes, not when lastSeenId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, subscribe, unsubscribe]);

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

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  }, [loading, channelId]);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsAtBottom(true);
      setNewCount(0);
    }
  }, []);

  const handleSend = useCallback((content: string) => {
    void sendMessage(content);
  }, [sendMessage]);

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
      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {topLevelMessages.length === 0 && (
          <div className="message-feed-empty">No messages yet</div>
        )}
        {topLevelMessages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            presenceStatus={msg.senderType === 'agent' ? getPresenceStatus?.(msg.senderId) ?? null : null}
            threadReplyCount={threadReplyCounts.get(msg.id)}
            onThreadOpen={onThreadOpen}
          />
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
