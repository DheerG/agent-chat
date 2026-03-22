import { useState, useEffect } from 'react';
import type { Channel } from '@agent-chat/shared';
import { fetchChannels } from '../lib/api';

export type ChannelWithStale = Channel & { stale?: boolean };

export function useChannels(tenantId: string | null, refreshKey?: number, includeStale?: boolean) {
  const [channels, setChannels] = useState<ChannelWithStale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setChannels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchChannels(tenantId, includeStale)
      .then((data) => {
        if (!cancelled) {
          setChannels(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load channels');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [tenantId, refreshKey, includeStale]);

  return { channels, loading, error };
}
