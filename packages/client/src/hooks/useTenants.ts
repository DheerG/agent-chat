import { useState, useEffect } from 'react';
import type { Tenant } from '@agent-chat/shared';
import { fetchTenants } from '../lib/api';

export function useTenants(refreshKey?: number) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTenants()
      .then((data) => {
        if (!cancelled) {
          setTenants(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tenants');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { tenants, loading, error };
}
