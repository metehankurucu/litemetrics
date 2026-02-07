import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopEventsProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopEvents({ period, limit = 10, className }: TopEventsProps) {
  const { data, isLoading } = useStats('top_events', { period, limit });
  return <TopList title="Events" type="events" data={data?.data ?? null} loading={isLoading} className={className} />;
}
