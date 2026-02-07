import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopPagesProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopPages({ period, limit = 10, className }: TopPagesProps) {
  const { data, isLoading } = useStats('top_pages', { period, limit });
  return <TopList title="Pages" type="pages" data={data?.data ?? null} loading={isLoading} className={className} />;
}
