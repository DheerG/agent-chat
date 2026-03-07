import { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '@agent-chat/shared';

type MessageHandler = (message: Message) => void;

interface UseWebSocketReturn {
  connected: boolean;
  subscribe: (channelId: string, lastSeenId?: string) => void;
  unsubscribe: (channelId: string) => void;
}

const MAX_RECONNECT_DELAY = 30_000;

export function useWebSocket(
  tenantId: string | null,
  onMessage?: MessageHandler
): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Map<string, string | undefined>>(new Map()); // channelId -> lastSeenId
  const reconnectDelayRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;

  const connect = useCallback(() => {
    const tid = tenantIdRef.current;
    if (!tid) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?tenantId=${tid}`);

    ws.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = 1000;
      // Re-subscribe to all channels on reconnect
      for (const [channelId, lastSeenId] of subscriptionsRef.current) {
        const msg: Record<string, unknown> = { type: 'subscribe', channelId };
        if (lastSeenId) msg['lastSeenId'] = lastSeenId;
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { type: string; message?: Message; messages?: Message[] };
        if (data.type === 'message' && data.message) {
          // Track lastSeenId for reconnection
          const msg = data.message;
          if (subscriptionsRef.current.has(msg.channelId)) {
            subscriptionsRef.current.set(msg.channelId, msg.id);
          }
          onMessageRef.current?.(msg);
        } else if (data.type === 'catchup' && data.messages) {
          for (const msg of data.messages) {
            if (subscriptionsRef.current.has(msg.channelId)) {
              subscriptionsRef.current.set(msg.channelId, msg.id);
            }
            onMessageRef.current?.(msg);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect with exponential backoff
      if (tenantIdRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY);
          connect();
        }, reconnectDelayRef.current);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    if (!tenantId) {
      // Clean up when tenant changes to null
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      subscriptionsRef.current.clear();
      setConnected(false);
      return;
    }

    // Close existing connection if tenant changed
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    subscriptionsRef.current.clear();
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [tenantId, connect]);

  const subscribe = useCallback((channelId: string, lastSeenId?: string) => {
    subscriptionsRef.current.set(channelId, lastSeenId);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: Record<string, unknown> = { type: 'subscribe', channelId };
      if (lastSeenId) msg['lastSeenId'] = lastSeenId;
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const unsubscribe = useCallback((channelId: string) => {
    subscriptionsRef.current.delete(channelId);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channelId }));
    }
  }, []);

  return { connected, subscribe, unsubscribe };
}
