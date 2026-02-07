import type { Period } from '@litemetrics/core';

export function formatDate(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '1h' || period === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatTooltipDate(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '1h' || period === '24h') {
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
