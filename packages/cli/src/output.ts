export type Format = 'json' | 'table' | 'csv';

const FORMATS: Format[] = ['json', 'table', 'csv'];

/** Valid `--period` tokens (mirrors the `Period` enum in @litemetrics/core). */
export const PERIODS = ['1h', '24h', '7d', '30d', '90d', 'custom'] as const;

/** Format-agnostic default used when the requested format is itself invalid. */
function defaultFormat(): Format {
  if (process.env.LITEMETRICS_FORMAT === 'json') return 'json';
  return process.stdout.isTTY ? 'table' : 'json';
}

export function resolveFormat(format?: string): Format {
  if (format !== undefined && !FORMATS.includes(format as Format)) {
    errorEnvelope(`Invalid --format "${format}". Valid: ${FORMATS.join(', ')}.`, defaultFormat(), {
      suggestions: nearest(format, FORMATS),
    });
  }
  if (format === 'json' || format === 'table' || format === 'csv') return format;
  return defaultFormat();
}

/**
 * Print an error as a `{ "error", ... }` JSON envelope (json mode) or a prose
 * `Error: <message>` line (table/csv mode) on stderr, then exit(1). Single
 * source for every user-facing CLI error so JSON consumers never get prose.
 */
export function errorEnvelope(
  message: string,
  format: Format,
  extra?: { suggestions?: string[]; status?: number },
): never {
  if (format === 'json') {
    const payload: Record<string, unknown> = { error: message };
    if (extra?.suggestions && extra.suggestions.length > 0) payload.suggestions = extra.suggestions;
    if (extra?.status !== undefined) payload.status = extra.status;
    console.error(JSON.stringify(payload));
  } else {
    const suffix = extra?.status !== undefined ? ` (HTTP ${extra.status})` : '';
    console.error(`Error: ${message}${suffix}`);
  }
  process.exit(1);
}

/**
 * R1: reject any `--period` outside the enum (with did-you-mean suggestions),
 * and reject `custom` unless both `--from` and `--to` are supplied. A no-op when
 * `period` is undefined (commander's per-command default has already applied).
 */
export function validatePeriod(
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  format: Format,
): void {
  if (period === undefined) return;
  if (!(PERIODS as readonly string[]).includes(period)) {
    errorEnvelope(`Invalid period "${period}". Valid: ${PERIODS.join(', ')}.`, format, {
      suggestions: nearest(period, [...PERIODS]),
    });
  }
  if (period === 'custom' && (!from || !to)) {
    errorEnvelope('Period "custom" requires both --from and --to (ISO dates).', format);
  }
}

// ─── R6: compact JSON ────────────────────────────────

let compactMode = false;

/** Toggle single-line JSON output (set once from the global flag / env). */
export function setCompactMode(on: boolean): void {
  compactMode = on;
}

/** Resolve compact mode from the `--compact` flag or `LITEMETRICS_COMPACT`. */
export function resolveCompact(flag?: boolean): boolean {
  return (
    Boolean(flag) ||
    process.env.LITEMETRICS_COMPACT === '1' ||
    process.env.LITEMETRICS_COMPACT === 'true'
  );
}

export function outputJSON(data: unknown): void {
  console.log(compactMode ? JSON.stringify(data) : JSON.stringify(data, null, 2));
}

export function outputTable(headers: string[], rows: string[][], footer?: string): void {
  if (rows.length === 0) {
    console.log('No data found.');
    return;
  }

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
  );

  const line = (cells: string[]) =>
    cells.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join('|');

  const sep = widths.map(w => '-'.repeat(w + 2)).join('+');

  console.log(line(headers));
  console.log(sep);
  rows.forEach(r => console.log(line(r)));

  if (footer) {
    console.log(sep);
    console.log(footer);
  }
}

export function outputCSV(headers: string[], rows: string[][]): void {
  const escape = (s: string) => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  console.log(headers.map(escape).join(','));
  rows.forEach(r => console.log(r.map(escape).join(',')));
}

export interface TableData {
  headers: string[];
  rows: string[][];
  footer?: string;
}

export function output(data: unknown, format: Format, table: TableData): void {
  switch (format) {
    case 'json':
      outputJSON(data);
      break;
    case 'csv':
      outputCSV(table.headers, table.rows);
      break;
    case 'table':
      outputTable(table.headers, table.rows, table.footer);
      break;
  }
}

export function parseFilters(filterArgs?: string[]): Record<string, string> | undefined {
  if (!filterArgs || filterArgs.length === 0) return undefined;
  const filters: Record<string, string> = {};
  for (const f of filterArgs) {
    const idx = f.indexOf('=');
    if (idx > 0) {
      filters[f.slice(0, idx)] = f.slice(idx + 1);
    }
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Closest candidates to `input` (substring matches first, then edit distance). */
export function nearest(input: string, candidates: string[], n = 3): string[] {
  return [...candidates]
    .map(c => ({
      c,
      d: c.includes(input) || input.includes(c) ? 0 : levenshtein(input, c),
    }))
    .sort((x, y) => x.d - y.d)
    .slice(0, n)
    .map(x => x.c);
}

/** Print a helpful "unknown metric" error with suggestions and exit(1). */
export function invalidMetric(metric: string, valid: string[], format: Format, listCmd: string): never {
  const suggestions = nearest(metric, valid);
  const message = `Unknown metric "${metric}". Did you mean: ${suggestions.join(', ')}? Run \`${listCmd}\` to list all.`;
  errorEnvelope(message, format, { suggestions });
}

/**
 * R4: surface the server's explanatory message rather than axios's opaque
 * "Request failed with status code 401". Prefers the server's structured
 * `response.data.error`, then `response.data.message`, then the thrown error's
 * own message, then its `code`. Blank / non-string values are skipped at every
 * step so a `{error: ""}` body never wins, and a dual-stack ECONNREFUSED (whose
 * AxiosError has a blank `message` but a `code`) surfaces the code instead of an
 * empty `{"error":""}` envelope.
 */
export function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: unknown; message?: unknown } }; code?: unknown };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;
  return (
    str(e?.response?.data?.error) ??
    str(e?.response?.data?.message) ??
    str(err instanceof Error ? err.message : undefined) ??
    str(e?.code) ??
    String(err)
  );
}

/** HTTP status of an axios-style error, if the failure came from a response. */
export function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export function handleError(err: unknown, format: Format): never {
  errorEnvelope(errorMessage(err), format, { status: errorStatus(err) });
}
