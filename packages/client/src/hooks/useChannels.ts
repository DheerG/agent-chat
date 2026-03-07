import { useState, useEffect } from 'react';
import type { Channel } from '@agent-chat/shared';
import { fetchChannels } from '../lib/api';

export function useChannels(tenantId: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setChannels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchChannels(tenantId)
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
  }, [tenantId]);

  return { channels, loading, error };
}
