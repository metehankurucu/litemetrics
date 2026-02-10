import { createContext, useContext, useEffect, useRef, useMemo } from "react";
import { createRNTracker, type RNTrackerConfig, type RNTrackerInstance } from "./tracker";

interface LitemetricsRNContextValue {
  tracker: RNTrackerInstance;
  siteId: string;
}

const LitemetricsRNContext = createContext<LitemetricsRNContextValue | null>(null);

export interface LitemetricsProviderProps extends RNTrackerConfig {
  children: React.ReactNode;
}

export function LitemetricsProvider({ children, ...config }: LitemetricsProviderProps) {
  const trackerRef = useRef<RNTrackerInstance | null>(null);

  if (!trackerRef.current) {
    trackerRef.current = createRNTracker(config);
  }

  useEffect(() => {
    return () => {
      trackerRef.current?.destroy();
    };
  }, []);

  const value = useMemo<LitemetricsRNContextValue>(
    () => ({
      tracker: trackerRef.current!,
      siteId: config.siteId,
    }),
    [config.siteId]
  );

  return (
    <LitemetricsRNContext.Provider value={value}>
      {children}
    </LitemetricsRNContext.Provider>
  );
}

export function useLitemetricsRNContext(): LitemetricsRNContextValue {
  const ctx = useContext(LitemetricsRNContext);
  if (!ctx) {
    throw new Error("useLitemetrics must be used within <LitemetricsProvider>");
  }
  return ctx;
}
