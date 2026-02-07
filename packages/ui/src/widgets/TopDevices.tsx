import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopDevicesProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopDevices({ period, limit = 10, className }: TopDevicesProps) {
  const { data, isLoading } = useStats('top_devices', { period, limit });
  return <TopList title="Devices" type="devices" data={data?.data ?? null} loading={isLoading} className={className} />;
}
