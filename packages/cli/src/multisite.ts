import { output, outputJSON, errorMessage, type Format, type TableData } from './output.js';

export interface PerSiteRunner<T> {
  /** Execute the query for one site ID, returning the raw result to emit. */
  run: (siteId: string) => Promise<T>;
  /** Build the table/csv view for a single site's result. */
  table: (result: T) => TableData;
}

/**
 * R7: run `spec.run` for each site ID and emit the result(s).
 *
 * Single site (the overwhelming common case) behaves byte-identically to a
 * direct query: it emits the raw result (json) or the table/csv view, and lets
 * any error propagate so the caller's `handleError` produces the usual
 * envelope. Callers must therefore keep their surrounding try/catch.
 *
 * Multiple sites run sequentially and emit ONE json object keyed by site ID,
 * with any per-site failures collected under an `"errors"` key (partial results
 * are still emitted); in table/csv mode it prints one section per site. It exits
 * 1 if ANY site failed, after emitting what succeeded.
 */
export async function runPerSite<T>(
  siteIds: string[],
  format: Format,
  spec: PerSiteRunner<T>,
): Promise<void> {
  if (siteIds.length === 1) {
    const result = await spec.run(siteIds[0]);
    output(result, format, spec.table(result));
    return;
  }

  const results: Record<string, T> = {};
  const errors: Record<string, string> = {};
  for (const siteId of siteIds) {
    try {
      results[siteId] = await spec.run(siteId);
    } catch (err) {
      errors[siteId] = errorMessage(err);
    }
  }

  if (format === 'json') {
    const payload: Record<string, unknown> = { ...results };
    if (Object.keys(errors).length > 0) payload.errors = errors;
    outputJSON(payload);
  } else {
    siteIds.forEach((siteId, i) => {
      if (i > 0) console.log('');
      console.log(`# site: ${siteId}`);
      if (siteId in results) {
        output(results[siteId], format, spec.table(results[siteId]));
      } else {
        console.log(`Error: ${errors[siteId]}`);
      }
    });
  }

  if (Object.keys(errors).length > 0) {
    process.exit(1);
  }
}
