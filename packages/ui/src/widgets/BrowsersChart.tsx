import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { PieChartCard } from '../components/PieChartCard';

interface BrowsersChartProps {
  period?: Period;
  className?: string;
}

export function BrowsersChart({ period, className }: BrowsersChartProps) {
  const { data, isLoading } = useStats('top_browsers', { period });
  const pieData = (data?.data ?? []).map((d) => ({ name: d.key, value: d.value }));
  return <PieChartCard title="Browsers" data={pieData} loading={isLoading} className={className} />;
}
