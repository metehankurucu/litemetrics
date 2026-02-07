import { createContext } from 'react';
import type { LitemetricsClient } from '@litemetrics/client';
import type { Period } from '@litemetrics/core';

export interface LitemetricsUIContextValue {
  client: LitemetricsClient;
  siteId: string;
  period: Period;
  setPeriod: (period: Period) => void;
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  staleTime: number;
}

export const LitemetricsUIContext = createContext<LitemetricsUIContextValue | null>(null);
