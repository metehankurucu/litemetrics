/**
 * Opt-in retention of raw event rows.
 *
 * This module is database-agnostic: it decides WHEN and HOW MUCH to delete, and talks to
 * the database only through the `EventRetentionStore` interface. The Postgres store lives
 * in `adapters/event-retention-postgres.ts`.
 *
 * Nothing here turns retention on by itself. A sweeper only exists when the caller passes
 * a valid period (`resolveEventRetentionDays`), and `start()` runs no sweep: the first one
 * happens one interval after `start()`.
 */

export const MIN_EVENT_RETENTION_DAYS = 30;
export const MAX_EVENT_RETENTION_DAYS = 36_500;
export const DEFAULT_EVENT_RETENTION_INTERVAL_MS = 600_000; // 10 minutes
export const DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP = 20_000;
export const DEFAULT_EVENT_RETENTION_WINDOW_MS = 3_600_000; // 1 hour
export const EVENT_RETENTION_LOG_PREFIX = '[event-retention]';

const DAY_MS = 86_400_000;
const MAX_TIMER_MS = 2_147_483_647;
const MAX_ERROR_MESSAGE_LENGTH = 160;

export type EventRetentionDaysResolution =
  | { status: 'disabled' }
  | { status: 'enabled'; days: number }
  | { status: 'invalid' };

/** Pure; no logging. */
export function resolveEventRetentionDays(value: unknown): EventRetentionDaysResolution {
  if (value === undefined || value === 0) return { status: 'disabled' };
  if (typeof value !== 'number' || !Number.isInteger(value)) return { status: 'invalid' };
  if (value < MIN_EVENT_RETENTION_DAYS || value > MAX_EVENT_RETENTION_DAYS) return { status: 'invalid' };
  return { status: 'enabled', days: value };
}

export interface EventRetentionWindowResult {
  /** Rows deleted by this window's committed transaction. */
  deleted: number;
  /** Whether the site still has a row with timestamp < cutoff after this window. */
  remaining: boolean;
}

export interface EventRetentionStore {
  /** The database server's current time, used only for the clock check. */
  databaseNow(): Promise<Date>;
  /** Distinct site ids holding at least one row older than cutoff; order unspecified. */
  listSiteIdsWithEventsBefore(cutoff: Date): Promise<string[]>;
  /** Delete one window of one site in its own transaction. */
  deleteOldestWindow(siteId: string, cutoff: Date, windowMs: number): Promise<EventRetentionWindowResult>;
}

export interface EventRetentionSweeperOptions {
  /** Must resolve to 'enabled' under resolveEventRetentionDays, else the constructor throws RangeError. */
  retentionDays: number;
  /** Default DEFAULT_EVENT_RETENTION_INTERVAL_MS. Positive safe integer no greater than 2,147,483,647, else RangeError. */
  intervalMs?: number;
  /** Default DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP. Positive safe integer, else RangeError. */
  maxRowsPerSweep?: number;
  /** Default DEFAULT_EVENT_RETENTION_WINDOW_MS. Positive safe integer, else RangeError. */
  windowMs?: number;
  /** Epoch-ms clock for the cutoff, the clock check and durations. When omitted, the global Date.now() is called at each use. */
  now?: () => number;
}

export type EventRetentionSweepStatus = 'ok' | 'error' | 'closed';

export interface EventRetentionSweepResult {
  status: EventRetentionSweepStatus;
  cutoff: Date;
  deleted: number;
  durationMs: number;
  more: boolean;
  /** Present only when status === 'error': the value the store threw, or the clock-check RangeError. */
  error?: unknown;
}

function assertPositiveSafeInteger(name: string, value: number, max = Number.MAX_SAFE_INTEGER): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${max}, got ${String(value)}`);
  }
}

/** ISO string that never throws, for values that may not be valid instants. */
function safeIso(ms: number): string {
  try {
    if (typeof ms === 'number' && Number.isFinite(ms)) {
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  } catch {
    // fall through
  }
  return String(ms);
}

function safeIsoDate(date: Date): string {
  try {
    return safeIso(date.getTime());
  } catch {
    return 'invalid';
  }
}

function errorClassOf(error: unknown): string {
  let value = 'unknown';
  try {
    if (typeof error === 'object' && error !== null) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && code.length > 0) {
        value = code;
      } else {
        const name = (error as { constructor?: { name?: unknown } }).constructor?.name;
        if (typeof name === 'string' && name.length > 0) value = name;
      }
    }
  } catch {
    value = 'unknown';
  }
  const cleaned = value.replace(/[^\x21-\x7e]/g, '').replace(/"/g, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

function errorMessageOf(error: unknown): string {
  let message: string;
  try {
    message = error instanceof Error ? String(error.message) : String(error);
  } catch {
    message = 'unknown';
  }
  return message
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/"/g, "'")
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export class EventRetentionSweeper {
  private readonly retentionDays: number;
  private readonly intervalMs: number;
  private readonly maxRowsPerSweep: number;
  private readonly windowMs: number;
  private readonly nowFn?: () => number;
  private timer?: ReturnType<typeof setInterval>;
  private inflight?: Promise<EventRetentionSweepResult>;
  private closed = false;

  constructor(private readonly store: EventRetentionStore, options: EventRetentionSweeperOptions) {
    const resolution = resolveEventRetentionDays(options?.retentionDays);
    if (resolution.status !== 'enabled') {
      throw new RangeError(
        `retentionDays must be an integer from ${MIN_EVENT_RETENTION_DAYS} to ${MAX_EVENT_RETENTION_DAYS}, got ${String(options?.retentionDays)}`,
      );
    }
    this.retentionDays = resolution.days;
    this.intervalMs = options.intervalMs ?? DEFAULT_EVENT_RETENTION_INTERVAL_MS;
    this.maxRowsPerSweep = options.maxRowsPerSweep ?? DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP;
    this.windowMs = options.windowMs ?? DEFAULT_EVENT_RETENTION_WINDOW_MS;
    assertPositiveSafeInteger('intervalMs', this.intervalMs, MAX_TIMER_MS);
    assertPositiveSafeInteger('maxRowsPerSweep', this.maxRowsPerSweep);
    assertPositiveSafeInteger('windowMs', this.windowMs);
    this.nowFn = options.now;
  }

  /** The clock, looked up at each use so fake timers installed at any point take effect. */
  private clock(): number {
    return this.nowFn ? this.nowFn() : Date.now();
  }

  /**
   * Runs no sweep itself. Installs a repeating timer: the first sweep starts `intervalMs`
   * after this call, later ones every `intervalMs`. Idempotent, and a no-op after close().
   */
  start(): void {
    if (this.closed || this.timer !== undefined) return;
    const timer = setInterval(() => {
      // A tick that finds a sweep in flight is skipped, not queued.
      if (this.closed || this.inflight) return;
      void this.sweep();
    }, this.intervalMs);
    if (typeof timer === 'object' && timer !== null && typeof (timer as { unref?: unknown }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    this.timer = timer;
  }

  /**
   * Never rejects. While a sweep is in flight, resolves to that sweep's result object.
   * After close() it resolves immediately with a 'closed' result and no store call.
   */
  sweep(): Promise<EventRetentionSweepResult> {
    if (this.inflight) return this.inflight;
    if (this.closed) return Promise.resolve(this.closedResult());
    const promise = (async () => {
      try {
        return await this.run();
      } finally {
        this.inflight = undefined;
      }
    })();
    this.inflight = promise;
    return promise;
  }

  /**
   * Stops the timer, starts no new store call, waits for the store call in flight (without
   * aborting it) and for the in-flight sweep to resolve. Idempotent, never rejects.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const inflight = this.inflight;
    if (inflight) {
      try {
        await inflight;
      } catch {
        // sweep() never rejects; nothing to do
      }
    }
  }

  private closedResult(): EventRetentionSweepResult {
    let cutoff: Date;
    try {
      cutoff = new Date(this.clock() - this.retentionDays * DAY_MS);
    } catch {
      cutoff = new Date(NaN);
    }
    return { status: 'closed', cutoff, deleted: 0, durationMs: 0, more: true };
  }

  private async run(): Promise<EventRetentionSweepResult> {
    let startMs = NaN;
    let cutoff = new Date(NaN);
    let deleted = 0;
    let more = true;
    let failed = false;
    let error: unknown;
    let stoppedByClose = false;

    try {
      startMs = this.clock();
      cutoff = new Date(startMs - this.retentionDays * DAY_MS);

      // Clock check first: the cutoff comes from this process's clock, so a clock that runs
      // ahead of the database would delete recent rows. Fail closed, delete nothing.
      const databaseNow = await this.store.databaseNow();
      const processMs = this.clock();
      const databaseMs =
        databaseNow !== null && typeof databaseNow === 'object' && typeof databaseNow.getTime === 'function'
          ? databaseNow.getTime()
          : NaN;
      if (!Number.isFinite(processMs) || !Number.isFinite(databaseMs) || Math.abs(processMs - databaseMs) > DAY_MS) {
        throw new RangeError(
          `process clock and database clock differ by more than 24 hours (process ${safeIso(processMs)}, database ${safeIso(databaseMs)}); nothing was deleted`,
        );
      }
      if (this.closed) {
        stoppedByClose = true;
      } else {
        const listed = await this.store.listSiteIdsWithEventsBefore(cutoff);
        if (this.closed) {
          stoppedByClose = true;
        } else {
          if (!Array.isArray(listed)) throw new TypeError('event retention store returned an invalid site list');
          const siteIds: string[] = listed;
          let sitesDone = 0;
          sites: for (const siteId of siteIds) {
            for (;;) {
              if (this.closed || deleted >= this.maxRowsPerSweep) break sites;
              const outcome = await this.store.deleteOldestWindow(siteId, cutoff, this.windowMs);
              const windowDeleted = outcome?.deleted;
              if (typeof windowDeleted !== 'number' || !Number.isFinite(windowDeleted) || windowDeleted < 0) {
                throw new TypeError('event retention store returned an invalid window result');
              }
              deleted += windowDeleted;
              if (!outcome.remaining) {
                sitesDone++;
                break;
              }
              // A window that deleted nothing but still reports rows left is never retried.
              if (windowDeleted === 0) break;
            }
          }
          more = sitesDone < siteIds.length;
        }
      }
    } catch (caught) {
      failed = true;
      error = caught;
      more = true;
    }

    if (failed || stoppedByClose) more = true;
    const status: EventRetentionSweepStatus = failed ? 'error' : this.closed ? 'closed' : 'ok';
    let durationMs = 0;
    try {
      const elapsed = this.clock() - startMs;
      durationMs = Number.isFinite(elapsed) ? Math.max(0, Math.trunc(elapsed)) : 0;
    } catch {
      durationMs = 0;
    }

    const result: EventRetentionSweepResult = { status, cutoff, deleted, durationMs, more };
    if (failed) result.error = error;
    this.report(result);
    return result;
  }

  /** One line per sweep that deleted something or failed; silent otherwise. */
  private report(result: EventRetentionSweepResult): void {
    if (result.status !== 'error' && result.deleted === 0) return;
    try {
      let line =
        `${EVENT_RETENTION_LOG_PREFIX} sweep status=${result.status} deleted=${result.deleted}` +
        ` cutoff=${safeIsoDate(result.cutoff)} duration_ms=${result.durationMs} more=${result.more}`;
      if (result.status === 'error') {
        line += ` error_class=${errorClassOf(result.error)} error="${errorMessageOf(result.error)}"`;
        console.error(line);
      } else {
        console.log(line);
      }
    } catch {
      // logging must never turn a sweep into a failure
    }
  }
}
