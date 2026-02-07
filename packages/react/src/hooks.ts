import { useEffect, useRef } from 'react';
import { useLitemetricsContext } from './context';

/**
 * Access the Litemetrics tracker instance.
 *
 * @example
 * ```tsx
 * function Button() {
 *   const { track, identify } = useLitemetrics();
 *   return <button onClick={() => track('click', { id: 'cta' })}>Click</button>;
 * }
 * ```
 */
export function useLitemetrics() {
  const { tracker } = useLitemetricsContext();

  return {
    track: tracker.track.bind(tracker),
    identify: tracker.identify.bind(tracker),
    page: tracker.page.bind(tracker),
    reset: tracker.reset.bind(tracker),
    opt_out: tracker.opt_out.bind(tracker),
    opt_in: tracker.opt_in.bind(tracker),
  };
}

/**
 * Automatically track page views when the URL changes.
 * Works with React Router, TanStack Router, or any router that updates `location`.
 *
 * @param deps - Dependencies to trigger page view (e.g., pathname from router).
 *               If not provided, uses `window.location.href`.
 *
 * @example
 * ```tsx
 * // With React Router v6+
 * import { useLocation } from 'react-router-dom';
 * function PageTracker() {
 *   const { pathname } = useLocation();
 *   usePageView(pathname);
 *   return null;
 * }
 *
 * // Without router (fallback to window.location)
 * function App() {
 *   usePageView();
 *   return <div>...</div>;
 * }
 * ```
 */
export function usePageView(pathname?: string) {
  const { tracker } = useLitemetricsContext();
  const isFirst = useRef(true);

  useEffect(() => {
    // Skip first render if autoTrack already fired
    if (isFirst.current) {
      isFirst.current = false;
      // Track initial page view
      tracker.page();
      return;
    }

    // Track subsequent navigations
    tracker.page();
  }, [pathname, tracker]);
}

/**
 * Track a custom event when the component mounts.
 *
 * @example
 * ```tsx
 * function PricingPage() {
 *   useTrackEvent('page_section_viewed', { section: 'pricing' });
 *   return <div>...</div>;
 * }
 * ```
 */
export function useTrackEvent(name: string, properties?: Record<string, unknown>) {
  const { tracker } = useLitemetricsContext();

  useEffect(() => {
    tracker.track(name, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
