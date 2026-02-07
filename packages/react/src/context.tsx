import { createContext, useContext, useEffect, useRef, useMemo } from 'react';
import type { LitemetricsInstance, TrackerConfig } from '@litemetrics/tracker';
import { createTracker } from '@litemetrics/tracker';

interface LitemetricsContextValue {
  tracker: LitemetricsInstance;
  siteId: string;
}

const LitemetricsContext = createContext<LitemetricsContextValue | null>(null);

export interface LitemetricsProviderProps extends Omit<TrackerConfig, 'autoTrack'> {
  children: React.ReactNode;
  autoPageView?: boolean;
}

export function LitemetricsProvider({
  children,
  autoPageView = true,
  ...config
}: LitemetricsProviderProps) {
  const trackerRef = useRef<LitemetricsInstance | null>(null);

  if (!trackerRef.current) {
    trackerRef.current = createTracker({
      ...config,
      // Disable built-in auto tracking; we'll handle it via hooks for SPA
      autoTrack: autoPageView && !config.autoSpa,
      autoSpa: false, // We handle SPA tracking via usePageView hook
    });
  }

  useEffect(() => {
    return () => {
      trackerRef.current?.destroy();
    };
  }, []);

  const value = useMemo<LitemetricsContextValue>(
    () => ({
      tracker: trackerRef.current!,
      siteId: config.siteId,
    }),
    [config.siteId],
  );

  return (
    <LitemetricsContext.Provider value={value}>
      {children}
    </LitemetricsContext.Provider>
  );
}

export function useLitemetricsContext(): LitemetricsContextValue {
  const ctx = useContext(LitemetricsContext);
  if (!ctx) {
    throw new Error('useLitemetrics must be used within <LitemetricsProvider>');
  }
  return ctx;
}
