import { useEffect, useRef, useCallback } from 'react';
import type { WsServerMessage } from '@agent-chat/shared';

type MessageHandler = (msg: WsServerMessage) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  useEffect(() => {
    let alive = true;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    function connect() {
      if (!alive) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        reconnectDelayRef.current = 1000; // reset backoff
        ws.send(JSON.stringify({ type: 'subscribe_all' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsServerMessage;
          onMessageRef.current(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!alive) return;
        // Exponential backoff reconnect: 1s, 2s, 4s, 8s, max 30s
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, 30_000);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;

      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    }

    connect();

    return () => {
      alive = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const subscribe = useCallback((conversationIds: string[]) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', conversationIds }));
    }
  }, []);

  const unsubscribe = useCallback((conversationIds: string[]) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', conversationIds }));
    }
  }, []);

  return { subscribe, unsubscribe };
}
