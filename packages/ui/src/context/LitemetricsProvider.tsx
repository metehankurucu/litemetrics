import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient } from '@litemetrics/client';
import type { Period } from '@litemetrics/core';
import { LitemetricsUIContext, type LitemetricsUIContextValue } from './LitemetricsUIContext';
import { buildStyleSheet, STYLE_ID, type LitemetricsTheme } from '../theme';

interface LitemetricsProviderProps {
  baseUrl: string;
  siteId: string;
  secretKey?: string;
  defaultPeriod?: Period;
  queryClient?: QueryClient;
  staleTime?: number;
  theme?: Partial<LitemetricsTheme>;
  darkTheme?: Partial<LitemetricsTheme>;
  children: ReactNode;
}

export function LitemetricsProvider({
  baseUrl,
  siteId,
  secretKey,
  defaultPeriod = '7d',
  queryClient: externalQueryClient,
  staleTime = 30_000,
  theme,
  darkTheme: darkThemeProp,
  children,
}: LitemetricsProviderProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const client = useMemo(
    () => createClient({ baseUrl, siteId, secretKey }),
    [baseUrl, siteId, secretKey],
  );

  const internalQueryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime } } }),
    [staleTime],
  );

  const queryClient = externalQueryClient ?? internalQueryClient;

  // Inject CSS custom properties via <style> tag
  useEffect(() => {
    const css = buildStyleSheet(theme, darkThemeProp);
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
    return () => {
      el?.remove();
    };
  }, [theme, darkThemeProp]);

  const value = useMemo<LitemetricsUIContextValue>(
    () => ({ client, siteId, period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, staleTime }),
    [client, siteId, period, dateFrom, dateTo, staleTime],
  );

  const content = (
    <LitemetricsUIContext.Provider value={value}>
      {children}
    </LitemetricsUIContext.Provider>
  );

  if (externalQueryClient) {
    return content;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {content}
    </QueryClientProvider>
  );
}
