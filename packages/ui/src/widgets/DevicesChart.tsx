import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { PieChartCard } from '../components/PieChartCard';

interface DevicesChartProps {
  period?: Period;
  className?: string;
}

export function DevicesChart({ period, className }: DevicesChartProps) {
  const { data, isLoading } = useStats('top_devices', { period });
  const pieData = (data?.data ?? []).map((d) => ({ name: d.key, value: d.value }));
  return <PieChartCard title="Devices" data={pieData} loading={isLoading} className={className} />;
}
