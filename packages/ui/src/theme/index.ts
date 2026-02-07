export interface LitemetricsTheme {
  bg?: string;
  bgSecondary?: string;
  bgTertiary?: string;
  border?: string;
  borderHover?: string;
  text?: string;
  textSecondary?: string;
  textTertiary?: string;
  textMuted?: string;
  accent?: string;
  accentLight?: string;
  accentText?: string;
  accentHover?: string;
  positive?: string;
  negative?: string;
  chartStroke?: string;
  chartFill?: string;
  chartGrid?: string;
  chartAxis?: string;
  tooltipBg?: string;
  tooltipText?: string;
  tooltipMuted?: string;
  bar?: string;
  barHover?: string;
  pie1?: string;
  pie2?: string;
  pie3?: string;
  pie4?: string;
  pie5?: string;
  pie6?: string;
  pie7?: string;
  pie8?: string;
  mapEmpty?: string;
  mapStroke?: string;
  mapHover?: string;
}

const KEY_TO_VAR: Record<keyof LitemetricsTheme, string> = {
  bg: '--lm-bg',
  bgSecondary: '--lm-bg-secondary',
  bgTertiary: '--lm-bg-tertiary',
  border: '--lm-border',
  borderHover: '--lm-border-hover',
  text: '--lm-text',
  textSecondary: '--lm-text-secondary',
  textTertiary: '--lm-text-tertiary',
  textMuted: '--lm-text-muted',
  accent: '--lm-accent',
  accentLight: '--lm-accent-light',
  accentText: '--lm-accent-text',
  accentHover: '--lm-accent-hover',
  positive: '--lm-positive',
  negative: '--lm-negative',
  chartStroke: '--lm-chart-stroke',
  chartFill: '--lm-chart-fill',
  chartGrid: '--lm-chart-grid',
  chartAxis: '--lm-chart-axis',
  tooltipBg: '--lm-tooltip-bg',
  tooltipText: '--lm-tooltip-text',
  tooltipMuted: '--lm-tooltip-muted',
  bar: '--lm-bar',
  barHover: '--lm-bar-hover',
  pie1: '--lm-pie-1',
  pie2: '--lm-pie-2',
  pie3: '--lm-pie-3',
  pie4: '--lm-pie-4',
  pie5: '--lm-pie-5',
  pie6: '--lm-pie-6',
  pie7: '--lm-pie-7',
  pie8: '--lm-pie-8',
  mapEmpty: '--lm-map-empty',
  mapStroke: '--lm-map-stroke',
  mapHover: '--lm-map-hover',
};

export const defaultTheme: Required<LitemetricsTheme> = {
  bg: '255 255 255',
  bgSecondary: '250 250 250',
  bgTertiary: '244 244 245',
  border: '228 228 231',
  borderHover: '212 212 216',
  text: '24 24 27',
  textSecondary: '113 113 122',
  textTertiary: '161 161 170',
  textMuted: '212 212 216',
  accent: '99 102 241',
  accentLight: '238 242 255',
  accentText: '67 56 202',
  accentHover: '129 140 248',
  positive: '5 150 105',
  negative: '239 68 68',
  chartStroke: '99 102 241',
  chartFill: '99 102 241',
  chartGrid: '244 244 245',
  chartAxis: '161 161 170',
  tooltipBg: '24 24 27',
  tooltipText: '255 255 255',
  tooltipMuted: '161 161 170',
  bar: '238 242 255',
  barHover: '224 231 255',
  pie1: '99 102 241',
  pie2: '139 92 246',
  pie3: '59 130 246',
  pie4: '20 184 166',
  pie5: '16 185 129',
  pie6: '245 158 11',
  pie7: '239 68 68',
  pie8: '236 72 153',
  mapEmpty: '244 244 245',
  mapStroke: '228 228 231',
  mapHover: '129 140 248',
};

export const darkTheme: Required<LitemetricsTheme> = {
  bg: '24 24 27',
  bgSecondary: '39 39 42',
  bgTertiary: '63 63 70',
  border: '63 63 70',
  borderHover: '82 82 91',
  text: '244 244 245',
  textSecondary: '161 161 170',
  textTertiary: '113 113 122',
  textMuted: '82 82 91',
  accent: '129 140 248',
  accentLight: '30 27 75',
  accentText: '165 180 252',
  accentHover: '165 180 252',
  positive: '52 211 153',
  negative: '248 113 113',
  chartStroke: '129 140 248',
  chartFill: '129 140 248',
  chartGrid: '63 63 70',
  chartAxis: '113 113 122',
  tooltipBg: '244 244 245',
  tooltipText: '24 24 27',
  tooltipMuted: '113 113 122',
  bar: '30 27 75',
  barHover: '49 46 129',
  pie1: '129 140 248',
  pie2: '167 139 250',
  pie3: '96 165 250',
  pie4: '45 212 191',
  pie5: '52 211 153',
  pie6: '251 191 36',
  pie7: '248 113 113',
  pie8: '244 114 182',
  mapEmpty: '39 39 42',
  mapStroke: '63 63 70',
  mapHover: '165 180 252',
};

export function themeToCSS(theme: Partial<LitemetricsTheme>): string {
  return Object.entries(theme)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => `${KEY_TO_VAR[key as keyof LitemetricsTheme]}: ${value};`)
    .join('\n  ');
}

export function buildStyleSheet(
  light?: Partial<LitemetricsTheme>,
  dark?: Partial<LitemetricsTheme>,
): string {
  const mergedLight = { ...defaultTheme, ...light };
  const mergedDark = { ...darkTheme, ...dark };

  return `:root, .litemetrics-light {\n  ${themeToCSS(mergedLight)}\n}\n\n.dark, .litemetrics-dark {\n  ${themeToCSS(mergedDark)}\n}`;
}

export const STYLE_ID = 'litemetrics-ui-theme';
