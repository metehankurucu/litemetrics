import { createContext, useCallback, useContext, useEffect, useRef, useMemo } from 'react';
import type { LitemetricsInstance, TrackerConfig } from '@litemetrics/tracker';
import { createTracker } from '@litemetrics/tracker';

interface LitemetricsContextValue {
  tracker: LitemetricsInstance;
  siteId: string;
}

const LitemetricsContext = createContext<LitemetricsContextValue | null>(null);

/** Handed out after the provider is gone, so a stale handle cannot revive tracking. */
const NOOP_TRACKER: LitemetricsInstance = {
  track() {},
  identify() {},
  page() {},
  reset() {},
  opt_out() {},
  opt_in() {},
  destroy() {},
};

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
  const configRef = useRef<TrackerConfig>(null!);
  configRef.current = {
    ...config,
    // Disable built-in auto tracking; we'll handle it via hooks for SPA
    autoTrack: autoPageView && !config.autoSpa,
    autoSpa: false, // We handle SPA tracking via usePageView hook
  };

  // True between an unmount and a remount. StrictMode unmounts and remounts the
  // same component in development, so "the cleanup ran" alone cannot mean "stop
  // tracking forever" - only a cleanup with no effect after it does, and the
  // effect below is what tells those two apart.
  const unmountedRef = useRef(false);

  // Resolved on every access instead of captured once. This provider destroys
  // its tracker on unmount and a destroyed tracker is inert, but the ref outlives
  // the instance across a StrictMode remount - so a captured instance would leave
  // every consumer holding a dead tracker for the rest of the session, silently.
  const resolveTracker = useCallback((): LitemetricsInstance => {
    if (unmountedRef.current) return NOOP_TRACKER;
    if (!trackerRef.current) {
      trackerRef.current = createTracker(configRef.current);
    }
    return trackerRef.current;
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    resolveTracker();
    return () => {
      unmountedRef.current = true;
      trackerRef.current?.destroy();
      trackerRef.current = null;
    };
  }, [resolveTracker]);

  const value = useMemo<LitemetricsContextValue>(
    () => ({
      // A stable facade: consumers keep one object identity for as long as the
      // provider lives, while each call reaches whichever tracker is current.
      tracker: {
        track: (...args: Parameters<LitemetricsInstance['track']>) => resolveTracker().track(...args),
        identify: (...args: Parameters<LitemetricsInstance['identify']>) =>
          resolveTracker().identify(...args),
        page: (...args: Parameters<LitemetricsInstance['page']>) => resolveTracker().page(...args),
        reset: () => resolveTracker().reset(),
        opt_out: () => resolveTracker().opt_out(),
        opt_in: () => resolveTracker().opt_in(),
        destroy: () => {
          trackerRef.current?.destroy();
          trackerRef.current = null;
        },
      },
      siteId: config.siteId,
    }),
    [resolveTracker, config.siteId],
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
