import { useState, useEffect, useCallback } from 'react';
import { createClient, type QueryResult, type Metric, type Period } from '@insayt/client';

const client = createClient({
  baseUrl: import.meta.env.VITE_INSAYT_URL || '',
  siteId: import.meta.env.VITE_INSAYT_SITE_ID || 'demo',
});

export function useStats(metric: Metric, period: Period = '7d') {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getStats(metric, { period });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [metric, period]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useOverview(period: Period = '7d') {
  const [data, setData] = useState<Record<string, QueryResult> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getOverview(
        ['pageviews', 'visitors', 'sessions', 'events'],
        { period },
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useSiteId() {
  const [siteId, setSiteIdState] = useState(
    import.meta.env.VITE_INSAYT_SITE_ID || 'demo',
  );

  const setSiteId = useCallback((id: string) => {
    client.setSiteId(id);
    setSiteIdState(id);
  }, []);

  return { siteId, setSiteId };
}
