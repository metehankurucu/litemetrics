import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopConversionsProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopConversions({ period, limit = 10, className }: TopConversionsProps) {
  const { data, isLoading } = useStats('top_conversions', { period, limit });
  return <TopList title="Top Conversions" type="conversions" data={data?.data ?? null} loading={isLoading} className={className} />;
}
