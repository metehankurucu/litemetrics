import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopBrowsersProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopBrowsers({ period, limit = 10, className }: TopBrowsersProps) {
  const { data, isLoading } = useStats('top_browsers', { period, limit });
  return <TopList title="Browsers" type="browsers" data={data?.data ?? null} loading={isLoading} className={className} />;
}
