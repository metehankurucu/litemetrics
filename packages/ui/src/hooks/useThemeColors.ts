import { useState, useEffect, useCallback } from 'react';
import { cssVar } from '../utils/theme';

/**
 * Hook that re-renders when the `<html>` element's class list changes (e.g. dark mode toggle).
 * Returns a `get()` helper that reads CSS custom properties as rgb() strings — perfect for
 * Recharts / SVG attributes that require concrete color values rather than Tailwind classes.
 */
export function useThemeColors() {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const target = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
          setTick((t) => t + 1);
          break;
        }
      }
    });
    observer.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);

  const get = useCallback((varName: string, fallback?: string) => cssVar(varName, fallback), []);

  return { get };
}
