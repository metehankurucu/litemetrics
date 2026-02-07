import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopReferrersProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopReferrers({ period, limit = 10, className }: TopReferrersProps) {
  const { data, isLoading } = useStats('top_referrers', { period, limit });
  return <TopList title="Referrers" type="referrers" data={data?.data ?? null} loading={isLoading} className={className} />;
}
