import { useState, useEffect, useRef, useCallback } from 'react';
import type { Presence } from '@agent-chat/shared';
import { fetchPresence } from '../lib/api';

const POLL_INTERVAL = 30_000; // 30 seconds

export function usePresence(tenantId: string | null, channelId: string | null) {
  const [presenceMap, setPresenceMap] = useState<Map<string, Presence>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!tenantId || !channelId) {
      setPresenceMap(new Map());
      return;
    }

    const load = async () => {
      try {
        const list = await fetchPresence(tenantId, channelId);
        const map = new Map<string, Presence>();
        for (const p of list) {
          map.set(p.agentId, p);
        }
        setPresenceMap(map);
      } catch {
        // Silently ignore presence errors — non-critical feature
      }
    };

    void load();
    intervalRef.current = setInterval(() => void load(), POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tenantId, channelId]);

  const getStatus = useCallback((agentId: string): 'active' | 'idle' | null => {
    const p = presenceMap.get(agentId);
    return p?.status ?? null;
  }, [presenceMap]);

  return { presenceMap, getStatus };
}
