/**
 * Request-shape validation for the date range every read endpoint accepts.
 *
 * The 31 Aug 2026 production 500 was `dateTo=--json`: a CLI let a flag be swallowed
 * as the value of `--to`, the server cast it to a string without looking at it, and
 * the adapter turned an unparseable date into a query failure. Nothing about that
 * request was unknowable up front, so it belongs in the 400 class - and the query
 * must not run at all, because a rejected request costs the database nothing.
 */

/**
 * A validation failure that should surface to the HTTP client as a 400 (not a
 * 500). The collector's error path reads `statusCode` off the thrown error.
 *
 * Lives here rather than in `adapters/utils.ts` because request-shape validation
 * runs before any adapter does; `adapters/utils.ts` re-exports it so the adapter
 * side keeps its existing import.
 */
export class QueryValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

export type DateParamName = 'dateFrom' | 'dateTo';

const MAX_ECHOED_VALUE = 40;

/**
 * Render an offending value for an error message. The value is attacker-controlled
 * and the message can be logged, so control characters are dropped (no forged log
 * line) and the length is capped (no multi-kilobyte error body).
 */
function describeValue(value: string): string {
  const clean = value.replace(/[^\x20-\x7e]/g, '');
  return clean.length > MAX_ECHOED_VALUE ? `${clean.slice(0, MAX_ECHOED_VALUE)}...` : clean;
}

/**
 * Validate one date query parameter. Returns the value unchanged when it is usable,
 * `undefined` when the caller did not supply one (absent or empty), and throws
 * `QueryValidationError` naming the parameter otherwise.
 */
export function parseDateParam(name: DateParamName, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    // A repeated query param arrives as an array; the old cast handed that straight
    // to the adapter.
    throw new QueryValidationError(`${name} must be a single ISO date (YYYY-MM-DD).`);
  }
  if (value === '') return undefined;
  if (value.startsWith('-')) {
    throw new QueryValidationError(
      `${name} received "${describeValue(value)}", which looks like a flag rather than a date; pass an ISO date (YYYY-MM-DD).`,
    );
  }
  if (/\s/.test(value)) {
    throw new QueryValidationError(
      `${name} must be a single ISO date (YYYY-MM-DD), got "${describeValue(value)}".`,
    );
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new QueryValidationError(
      `${name} must be an ISO date (YYYY-MM-DD), got "${describeValue(value)}".`,
    );
  }
  return value;
}

/**
 * Validate the `period` / `dateFrom` / `dateTo` trio and return the two dates in
 * their canonical (string or undefined) form. `period=custom` needs both ends;
 * ordering is checked whenever both are present, custom or not.
 */
export function validateDateRange(q: {
  period?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}): { dateFrom?: string; dateTo?: string } {
  const dateFrom = parseDateParam('dateFrom', q.dateFrom);
  const dateTo = parseDateParam('dateTo', q.dateTo);

  if (q.period === 'custom' && (!dateFrom || !dateTo)) {
    const missing = !dateFrom && !dateTo ? 'dateFrom and dateTo are' : !dateFrom ? 'dateFrom is' : 'dateTo is';
    throw new QueryValidationError(
      `period=custom requires both dateFrom and dateTo (ISO dates); ${missing} missing.`,
    );
  }

  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw new QueryValidationError(
      `dateFrom must be before dateTo, got dateFrom="${describeValue(dateFrom)}" and dateTo="${describeValue(dateTo)}".`,
    );
  }

  return { dateFrom, dateTo };
}
