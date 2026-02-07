import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { TopList } from '../components/TopList';

interface TopCountriesProps {
  period?: Period;
  limit?: number;
  className?: string;
}

export function TopCountries({ period, limit = 10, className }: TopCountriesProps) {
  const { data, isLoading } = useStats('top_countries', { period, limit });
  return <TopList title="Countries" type="countries" data={data?.data ?? null} loading={isLoading} className={className} />;
}
