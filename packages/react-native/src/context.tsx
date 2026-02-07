import { createContext, useContext, useEffect, useRef, useMemo } from "react";
import type { TrackerConfig } from "@insayt/core";
import { createRNTracker, type RNTrackerInstance } from "./tracker";

interface InsaytRNContextValue {
  tracker: RNTrackerInstance;
  siteId: string;
}

const InsaytRNContext = createContext<InsaytRNContextValue | null>(null);

export interface InsaytProviderProps
  extends Omit<TrackerConfig, "autoTrack" | "autoSpa"> {
  children: React.ReactNode;
}

export function InsaytProvider({ children, ...config }: InsaytProviderProps) {
  const trackerRef = useRef<RNTrackerInstance | null>(null);

  if (!trackerRef.current) {
    trackerRef.current = createRNTracker(config);
  }

  useEffect(() => {
    return () => {
      trackerRef.current?.destroy();
    };
  }, []);

  const value = useMemo<InsaytRNContextValue>(
    () => ({
      tracker: trackerRef.current!,
      siteId: config.siteId,
    }),
    [config.siteId]
  );

  return (
    <InsaytRNContext.Provider value={value}>
      {children}
    </InsaytRNContext.Provider>
  );
}

export function useInsaytRNContext(): InsaytRNContextValue {
  const ctx = useContext(InsaytRNContext);
  if (!ctx) {
    throw new Error("useInsayt must be used within <InsaytProvider>");
  }
  return ctx;
}
