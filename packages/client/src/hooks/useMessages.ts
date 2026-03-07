import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '@agent-chat/shared';
import { fetchMessages, sendMessage as sendMessageApi } from '../lib/api';

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string, parentMessageId?: string) => Promise<void>;
  addMessage: (message: Message) => void;
  lastSeenId: string | undefined;
}

export function useMessages(
  tenantId: string | null,
  channelId: string | null
): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId || !channelId) {
      setMessages([]);
      seenIdsRef.current.clear();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMessages(tenantId, channelId, { limit: 50 })
      .then((result) => {
        if (!cancelled) {
          const ids = new Set<string>();
          for (const m of result.messages) {
            ids.add(m.id);
          }
          seenIdsRef.current = ids;
          setMessages(result.messages);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [tenantId, channelId]);

  const addMessage = useCallback((message: Message) => {
    // Deduplicate: skip if we already have this message (e.g., from REST + WS race)
    if (seenIdsRef.current.has(message.id)) return;
    seenIdsRef.current.add(message.id);
    setMessages((prev) => [...prev, message]);
  }, []);

  const sendMessage = useCallback(async (content: string, parentMessageId?: string) => {
    if (!tenantId || !channelId) return;
    try {
      // Send via REST. The WebSocket broadcast will deliver it back to us via addMessage.
      await sendMessageApi(tenantId, channelId, content, parentMessageId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [tenantId, channelId]);

  const lastSeenId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined;

  return { messages, loading, error, sendMessage, addMessage, lastSeenId };
}
