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
  const configRef = useRef<TrackerConfig | null>(null);
  if (configRef.current === null) {
    configRef.current = {
      ...config,
      // Disable built-in auto tracking; we'll handle it via hooks for SPA
      autoTrack: autoPageView && !config.autoSpa,
      autoSpa: false, // We handle SPA tracking via usePageView hook
    };
  }

  // Set once the provider is really gone, so a handle held past unmount cannot
  // start tracking again. It is NOT set in the cleanup: see the effect below.
  const stoppedRef = useRef(false);
  const teardownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved on every access instead of captured once. This provider tears its
  // tracker down when it goes away, and a torn-down tracker is inert, but the ref
  // outlives the instance across a StrictMode remount - so a captured instance
  // would leave every consumer holding a dead tracker, silently.
  const resolveTracker = useCallback((): LitemetricsInstance => {
    if (stoppedRef.current) return NOOP_TRACKER;
    if (!trackerRef.current) {
      trackerRef.current = createTracker(configRef.current!);
    }
    return trackerRef.current;
  }, []);

  useEffect(() => {
    if (teardownRef.current) {
      clearTimeout(teardownRef.current);
      teardownRef.current = null;
    }
    stoppedRef.current = false;
    resolveTracker();
    return () => {
      // Teardown is deferred by a task on purpose. StrictMode's simulated unmount
      // is followed by a remount in the same task, and a child's effect runs
      // BEFORE its parent's - so a child tracking on mount (which is what both of
      // this package's hooks do) would otherwise land in the window after this
      // cleanup and before the provider is back, and be discarded. A real unmount
      // has no effect after it, so nothing cancels this and teardown happens.
      teardownRef.current = setTimeout(() => {
        teardownRef.current = null;
        stoppedRef.current = true;
        trackerRef.current?.destroy();
        trackerRef.current = null;
      }, 0);
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
          // Stop for good, rather than letting the next call rebuild a tracker.
          stoppedRef.current = true;
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
