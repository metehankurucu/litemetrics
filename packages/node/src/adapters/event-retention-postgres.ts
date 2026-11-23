import type { Pool, PoolClient, QueryResult } from 'pg';
import type { EventRetentionStore, EventRetentionWindowResult } from '../event-retention';

/**
 * Postgres store behind the event retention sweeper.
 *
 * Rules every method follows:
 * - one pooled connection per call, checked out with `pool.connect()` (never `pool.query`),
 *   so the client-side deadline below can destroy it;
 * - one transaction per call, with `SET LOCAL statement_timeout`, so the timeout cannot
 *   outlive the call on a pooled connection;
 * - every value that came from a caller or from the database travels as a bound `$n`
 *   parameter. The only value written into SQL text is the validated integer timeout;
 * - nothing is written to the console.
 */

const EVENTS_TABLE = 'litemetrics_events';

export const DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW = 5_000;

/** Largest statement timeout whose client-side deadline (timeout + slack) still fits a timer. */
const MAX_STATEMENT_TIMEOUT_MS = 2_147_473_647;
/** Extra time a checkout or statement gets, beyond the server-side timeout, before the client gives up. */
const CLIENT_DEADLINE_SLACK_MS = 10_000;

export interface PostgresEventRetentionStoreOptions {
  /** Default DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS. Positive safe integer no greater than 2,147,473,647, else the constructor throws RangeError. */
  statementTimeoutMs?: number;
  /** Row cap of one window. Default DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW. Positive safe integer, else the constructor throws RangeError. */
  maxRowsPerWindow?: number;
}

type Query = (text: string, values?: unknown[]) => Promise<QueryResult>;

/**
 * Distinct site ids that hold at least one row older than the cutoff.
 *
 * A recursive "skip scan": each step takes the smallest site_id greater than the previous
 * one (one index probe on idx_litemetrics_events_site_ts), then keeps the site when an
 * older row exists (a second probe on the same index). Work grows with the number of
 * distinct site ids, not with the number of rows. It never filters on timestamp alone, so
 * it does not need the BRIN index.
 */
const LIST_SITES_SQL = `
WITH RECURSIVE sites(site_id) AS (
  (SELECT e.site_id FROM ${EVENTS_TABLE} e ORDER BY e.site_id ASC LIMIT 1)
  UNION ALL
  SELECT (SELECT e.site_id FROM ${EVENTS_TABLE} e WHERE e.site_id > s.site_id ORDER BY e.site_id ASC LIMIT 1)
  FROM sites s
  WHERE s.site_id IS NOT NULL
)
SELECT s.site_id AS site_id
FROM sites s
WHERE s.site_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM ${EVENTS_TABLE} e WHERE e.site_id = s.site_id AND e.timestamp < $1::timestamptz)
`;

/**
 * Oldest eligible row of one site: the start of the next window. Read back as ISO 8601 UTC text with
 * microseconds (never as a JS Date), so the round trip does not depend on the session DateStyle or TimeZone.
 */
const OLDEST_ELIGIBLE_SQL = `
SELECT to_char(e.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t0
FROM ${EVENTS_TABLE} e
WHERE e.site_id = $1 AND e.timestamp < $2::timestamptz
ORDER BY e.timestamp ASC
LIMIT 1
`;

/**
 * One window: this site's oldest rows with t0 <= timestamp < min(t0 + window, cutoff), at most
 * $5 of them, oldest first. Selecting by (site_id, timestamp range) ordered by timestamp is the
 * access path of idx_litemetrics_events_site_ts. The bounds are computed here, from the text of
 * t0 handed back by the previous statement, so microseconds survive and no JS arithmetic touches
 * a timestamp read from the database.
 */
const DELETE_WINDOW_SQL = `
DELETE FROM ${EVENTS_TABLE}
WHERE site_id = $1
  AND timestamp < $4::timestamptz
  AND event_id IN (
  SELECT e.event_id
  FROM ${EVENTS_TABLE} e
  WHERE e.site_id = $1
    AND e.timestamp >= $2::timestamptz
    AND e.timestamp < LEAST($2::timestamptz + ($3::double precision * interval '1 millisecond'), $4::timestamptz)
  ORDER BY e.timestamp ASC
  LIMIT $5
)
`;

const ANY_ELIGIBLE_SQL = `
SELECT EXISTS (
  SELECT 1 FROM ${EVENTS_TABLE} e WHERE e.site_id = $1 AND e.timestamp < $2::timestamptz
) AS remaining
`;

function assertPositiveSafeInteger(name: string, value: unknown, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${max}, got ${String(value)}`);
  }
}

function assertValidCutoff(cutoff: unknown): asserts cutoff is Date {
  if (cutoff === null || typeof cutoff !== 'object' || typeof (cutoff as Date).getTime !== 'function'
    || !Number.isFinite((cutoff as Date).getTime())) {
    throw new RangeError('cutoff must be a valid Date');
  }
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

export class PostgresEventRetentionStore implements EventRetentionStore {
  private readonly statementTimeoutMs: number;
  private readonly maxRowsPerWindow: number;

  constructor(private readonly pool: Pool, options: PostgresEventRetentionStoreOptions = {}) {
    this.statementTimeoutMs = options?.statementTimeoutMs ?? DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS;
    this.maxRowsPerWindow = options?.maxRowsPerWindow ?? DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW;
    assertPositiveSafeInteger('statementTimeoutMs', this.statementTimeoutMs, MAX_STATEMENT_TIMEOUT_MS);
    assertPositiveSafeInteger('maxRowsPerWindow', this.maxRowsPerWindow);
  }

  async databaseNow(): Promise<Date> {
    return this.inTransaction(async (query) => {
      const result = await query('SELECT now() AS now');
      const value: unknown = result.rows[0]?.now;
      // new Date(...) on whatever the driver returned: a host pg.types override may hand back a string.
      const date = value instanceof Date || typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : new Date(NaN);
      if (Number.isNaN(date.getTime())) throw new TypeError('database now() did not return a usable timestamp');
      return date;
    });
  }

  async listSiteIdsWithEventsBefore(cutoff: Date): Promise<string[]> {
    assertValidCutoff(cutoff);
    return this.inTransaction(async (query) => {
      const result = await query(LIST_SITES_SQL, [cutoff]);
      const seen = new Set<string>();
      for (const row of result.rows) {
        if (row && typeof row.site_id === 'string') seen.add(row.site_id);
      }
      return [...seen];
    });
  }

  async deleteOldestWindow(siteId: string, cutoff: Date, windowMs: number): Promise<EventRetentionWindowResult> {
    assertPositiveSafeInteger('windowMs', windowMs);
    if (typeof siteId !== 'string') throw new TypeError('siteId must be a string');
    assertValidCutoff(cutoff);
    return this.inTransaction(async (query) => {
      const oldest = await query(OLDEST_ELIGIBLE_SQL, [siteId, cutoff]);
      const t0: unknown = oldest.rows[0]?.t0;
      if (typeof t0 !== 'string' || t0.length === 0) return { deleted: 0, remaining: false };
      const deletion = await query(DELETE_WINDOW_SQL, [siteId, t0, windowMs, cutoff, this.maxRowsPerWindow]);
      const deleted = Number(deletion.rowCount ?? 0);
      const check = await query(ANY_ELIGIBLE_SQL, [siteId, cutoff]);
      return { deleted, remaining: toBoolean(check.rows[0]?.remaining) };
    });
  }

  private deadlineMs(): number {
    return this.statementTimeoutMs + CLIENT_DEADLINE_SLACK_MS;
  }

  private deadlineError(what: string): Error {
    const error = new Error(`event retention ${what} did not settle within ${this.deadlineMs()} ms`);
    (error as Error & { code?: string }).code = 'retention_client_deadline';
    return error;
  }

  /** Checkout bounded by the client-side deadline. A client that arrives late is destroyed at once. */
  private checkout(): Promise<PoolClient> {
    return new Promise<PoolClient>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(this.deadlineError('connection checkout'));
      }, this.deadlineMs());
      let pending: Promise<PoolClient>;
      try {
        pending = Promise.resolve(this.pool.connect());
      } catch (error) {
        settled = true;
        clearTimeout(timer);
        reject(error);
        return;
      }
      pending.then(
        (client) => {
          if (settled) {
            try { client.release(true); } catch { /* already gone */ }
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(client);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /**
   * Run `work` in one transaction on one pooled connection under the statement timeout.
   * Commits when `work` resolves; rolls back and rethrows the original error otherwise.
   */
  private async inTransaction<T>(work: (query: Query) => Promise<T>): Promise<T> {
    const client = await this.checkout();
    // pg-pool removes its own idle 'error' listener while a client is checked out, and pg emits
    // 'error' on the client when its socket dies. Without a listener that would crash the process.
    // The pending query rejects on its own; the connection is destroyed on release.
    const emitter = client as unknown as { on?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void };
    const onClientError = (): void => { /* handled through the rejected query */ };
    if (typeof emitter.on === 'function') emitter.on.call(client, 'error', onClientError);
    let released = false;
    const release = (destroy: boolean): void => {
      if (released) return;
      released = true;
      if (typeof emitter.removeListener === 'function') emitter.removeListener.call(client, 'error', onClientError);
      try { client.release(destroy); } catch { /* already gone */ }
    };
    // Each statement must settle within the deadline. On a miss the connection is destroyed (its
    // open transaction can never commit), a late result is ignored, and the call rejects.
    const query: Query = (text, values) => new Promise<QueryResult>((resolve, reject) => {
      if (released) {
        reject(this.deadlineError('statement'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        release(true);
        reject(this.deadlineError('statement'));
      }, this.deadlineMs());
      let pending: Promise<QueryResult>;
      try {
        pending = Promise.resolve(values === undefined ? client.query(text) : client.query(text, values));
      } catch (error) {
        settled = true;
        clearTimeout(timer);
        reject(error);
        return;
      }
      pending.then(
        (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });

    try {
      await query('BEGIN');
      // Validated integer, the one value allowed in SQL text. LOCAL: gone at COMMIT or ROLLBACK.
      await query(`SET LOCAL statement_timeout = ${this.statementTimeoutMs}`);
      // If the client gives up (deadline) on a half-open socket, the server still ends the idle
      // transaction and its row locks on its own. Validated integer, same rule as above.
      await query(`SET LOCAL idle_in_transaction_session_timeout = ${this.deadlineMs()}`);
      const value = await work(query);
      await query('COMMIT');
      release(false);
      return value;
    } catch (error) {
      // A missed deadline already destroyed the connection: nothing more to send.
      if (released) throw error;
      try {
        await query('ROLLBACK');
      } catch {
        release(true);
        throw error;
      }
      release(false);
      throw error;
    }
  }
}
