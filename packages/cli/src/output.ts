export type Format = 'json' | 'table' | 'csv';

export function resolveFormat(format?: string): Format {
  if (format === 'json' || format === 'table' || format === 'csv') return format;
  if (process.env.LITEMETRICS_FORMAT === 'json') return 'json';
  return process.stdout.isTTY ? 'table' : 'json';
}

export function outputJSON(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
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
  if (format === 'json') {
    console.error(JSON.stringify({ error: message, suggestions }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

export function handleError(err: unknown, format: Format): void {
  const message = err instanceof Error ? err.message : String(err);
  if (format === 'json') {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
