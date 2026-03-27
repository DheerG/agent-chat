import { useState, useEffect } from 'react';
import type { RecentChannel } from '@agent-chat/shared';
import { fetchRecentChannels } from '../lib/api';

export function useRecentChannels(refreshKey?: number) {
  const [channels, setChannels] = useState<RecentChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRecentChannels()
      .then((data) => {
        if (!cancelled) {
          setChannels(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recent channels');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { channels, loading, error };
}
