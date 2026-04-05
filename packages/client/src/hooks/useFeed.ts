import { useState, useEffect, useCallback } from 'react';
import type { FeedItem, Message } from '@agent-chat/shared';
import { fetchFeed } from '../lib/api';

export function useFeed(conversationId: string | null) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchFeed(conversationId, { limit: 50 })
      .then(data => {
        if (!cancelled) {
          setItems(data.items);
          setError(null);
          if (data.items.length > 0) {
            setLastSeenId(data.items[data.items.length - 1]!.id);
          }
        }
      })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  const addMessage = useCallback((msg: Message) => {
    const feedMsg: FeedItem = {
      type: 'message',
      id: msg.id,
      conversationId: msg.conversationId,
      parentMessageId: msg.parentMessageId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderType: msg.senderType,
      content: msg.content,
      messageType: msg.messageType,
      metadata: msg.metadata,
      createdAt: msg.createdAt,
    };
    setItems(prev => [...prev, feedMsg]);
    setLastSeenId(msg.id);
  }, []);

  return { items, loading, error, addMessage, lastSeenId };
}
