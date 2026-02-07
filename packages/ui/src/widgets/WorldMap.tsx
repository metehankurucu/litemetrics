import { useState, memo, lazy, Suspense } from 'react';
import type { Period } from '@litemetrics/core';
import { useStats } from '../hooks/useStats';
import { useThemeColors } from '../hooks/useThemeColors';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface CountryData {
  [iso: string]: number;
}

interface WorldMapProps {
  period?: Period;
  className?: string;
}

const WorldMapInner = lazy(() => import('./WorldMapInner'));

export const WorldMap = memo(function WorldMap({ period, className }: WorldMapProps) {
  const [tooltip, setTooltip] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
  const { get } = useThemeColors();

  const { data: statsResult, isLoading: loading } = useStats('top_countries', { period, limit: 200 });

  const countryData: CountryData = {};
  if (statsResult?.data) {
    for (const d of statsResult.data) {
      countryData[d.key] = d.value;
    }
  }

  const maxValue = Math.max(...Object.values(countryData), 1);

  // Parse RGB triplet string "R G B" into [r, g, b]
  function parseRGB(triplet: string): [number, number, number] {
    const parts = triplet.trim().split(/\s+/).map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  function getColor(iso: string): string {
    const value = countryData[iso] || 0;
    const emptyColor = get('--lm-map-empty', '244 244 245');
    if (value === 0) return emptyColor;

    const intensity = Math.min(value / maxValue, 1);
    // Interpolate from empty color to accent color
    const emptyRaw = getComputedStyle(document.documentElement).getPropertyValue('--lm-map-empty').trim() || '244 244 245';
    const accentRaw = getComputedStyle(document.documentElement).getPropertyValue('--lm-accent').trim() || '99 102 241';
    const [er, eg, eb] = parseRGB(emptyRaw);
    const [ar, ag, ab] = parseRGB(accentRaw);
    const r = Math.round(er + intensity * (ar - er));
    const g = Math.round(eg + intensity * (ag - eg));
    const b = Math.round(eb + intensity * (ab - eb));
    return `rgb(${r}, ${g}, ${b})`;
  }

  const strokeColor = get('--lm-map-stroke', '228 228 231');
  const hoverColor = get('--lm-map-hover', '129 140 248');

  return (
    <div className={`rounded-xl bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] p-5 ${className ?? ''}`}>
      <h3 className="text-xs font-medium text-[rgb(var(--lm-text-tertiary))] uppercase tracking-wide mb-3">Visitors by Country</h3>
      {loading ? (
        <div className="h-64 bg-[rgb(var(--lm-bg-secondary))] rounded-lg animate-pulse" />
      ) : (
        <Suspense fallback={<div className="h-64 bg-[rgb(var(--lm-bg-secondary))] rounded-lg flex items-center justify-center text-[rgb(var(--lm-text-tertiary))] text-sm">Loading map...</div>}>
          <WorldMapInner
            geoUrl={geoUrl}
            countryData={countryData}
            getColor={getColor}
            setTooltip={setTooltip}
            strokeColor={strokeColor}
            hoverColor={hoverColor}
          />
        </Suspense>
      )}
      {tooltip && (
        <div
          className="fixed z-50 bg-[rgb(var(--lm-tooltip-bg))] text-[rgb(var(--lm-tooltip-text))] text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <p className="font-medium">{tooltip.name}</p>
          <p className="text-[rgb(var(--lm-tooltip-muted))]">{tooltip.value.toLocaleString()} visitor{tooltip.value !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
});
