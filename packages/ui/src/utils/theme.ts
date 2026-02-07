/** Read a CSS custom property and return it as an rgb() string for SVG/Recharts use */
export function cssVar(name: string, fallback?: string): string {
  if (typeof document === 'undefined') return fallback ? `rgb(${fallback})` : '';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback ? `rgb(${fallback})` : '';
  // If it looks like an RGB triplet (space-separated numbers), wrap in rgb()
  if (/^\d+\s+\d+\s+\d+$/.test(raw)) return `rgb(${raw.replace(/ /g, ', ')})`;
  return raw;
}

const DEFAULT_PIE = [
  '99 102 241', '139 92 246', '59 130 246', '20 184 166',
  '16 185 129', '245 158 11', '239 68 68', '236 72 153',
];

/** Read --lm-pie-1..8 CSS variables, returning hex/rgb strings for Recharts Cell fill */
export function getPieColors(): string[] {
  return Array.from({ length: 8 }, (_, i) =>
    cssVar(`--lm-pie-${i + 1}`, DEFAULT_PIE[i]),
  );
}
