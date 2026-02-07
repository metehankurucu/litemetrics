import { createContext, useContext, useEffect, useRef, useMemo } from 'react';
import type { InsaytInstance, TrackerConfig } from '@insayt/tracker';
import { createTracker } from '@insayt/tracker';

interface InsaytContextValue {
  tracker: InsaytInstance;
  siteId: string;
}

const InsaytContext = createContext<InsaytContextValue | null>(null);

export interface InsaytProviderProps extends Omit<TrackerConfig, 'autoTrack'> {
  children: React.ReactNode;
  autoPageView?: boolean;
}

export function InsaytProvider({
  children,
  autoPageView = true,
  ...config
}: InsaytProviderProps) {
  const trackerRef = useRef<InsaytInstance | null>(null);

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

  const value = useMemo<InsaytContextValue>(
    () => ({
      tracker: trackerRef.current!,
      siteId: config.siteId,
    }),
    [config.siteId],
  );

  return (
    <InsaytContext.Provider value={value}>
      {children}
    </InsaytContext.Provider>
  );
}

export function useInsaytContext(): InsaytContextValue {
  const ctx = useContext(InsaytContext);
  if (!ctx) {
    throw new Error('useInsayt must be used within <InsaytProvider>');
  }
  return ctx;
}
