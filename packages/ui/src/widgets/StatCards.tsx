import type { Period } from '@litemetrics/core';
import { useOverview } from '../hooks/useOverview';
import { StatCard } from '../components/StatCard';

interface StatCardsProps {
  period?: Period;
  className?: string;
}

export function StatCards({ period, className }: StatCardsProps) {
  const { data: overview, isLoading: loading } = useOverview({ period });

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-5 ${className ?? ''}`}>
      <StatCard
        title="Pageviews"
        value={overview?.pageviews?.total ?? 0}
        changePercent={overview?.pageviews?.changePercent}
        loading={loading}
      />
      <StatCard
        title="Visitors"
        value={overview?.visitors?.total ?? 0}
        changePercent={overview?.visitors?.changePercent}
        loading={loading}
      />
      <StatCard
        title="Sessions"
        value={overview?.sessions?.total ?? 0}
        changePercent={overview?.sessions?.changePercent}
        loading={loading}
      />
      <StatCard
        title="Events"
        value={overview?.events?.total ?? 0}
        changePercent={overview?.events?.changePercent}
        loading={loading}
      />
    </div>
  );
}
