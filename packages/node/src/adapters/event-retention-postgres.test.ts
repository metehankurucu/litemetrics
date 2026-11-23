import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Pool, types as pgTypes } from 'pg';
import type { PoolConfig } from 'pg';
import type { EnrichedEvent } from '@litemetrics/core';
import { PostgresAdapter } from './postgres';
import { PostgresEventRetentionStore } from './event-retention-postgres';
import { DEFAULT_EVENT_RETENTION_INTERVAL_MS, EventRetentionSweeper } from '../event-retention';
import type {
  EventRetentionStore,
  EventRetentionSweepResult,
  EventRetentionSweeperOptions,
} from '../event-retention';

/**
 * Real-Postgres contract tests for event retention (contract R2, R3, R5 (c), R6, R7,
 * R11, B3). Skipped without DATABASE_URL_TEST; a skipped run is not evidence.
 *
 * The database is shared with other test files: this file truncates the events,
 * identity map and sites tables before each test, scopes its aggregate rows to ids it
 * creates, and closes every adapter, pool and sweeper it opens.
 */

const TEST_URL = process.env.DATABASE_URL_TEST;
const describeIfDb = TEST_URL ? describe : describe.skip;

const DAY_MS = 86_400_000;
const N = 30;
const MAX_SWEEPS = 1_000;
const SLOW = 120_000;
const RETENTION_DELETE = /\bDELETE\s+FROM\s+litemetrics_events\b/i;
const HOSTILE_SITE = "site-o'brien; -- tail";
const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;

type EventType = 'pageview' | 'event' | 'identify';
type SeedRow = { site: string; ts: number; label: string; type?: EventType; bot?: string | null; visitor?: string };
type StatementLog = { statements: Array<{ text: string; values?: unknown[] }>; poolQueries: number };

describeIfDb('event retention on a real Postgres', () => {
  let adapter: PostgresAdapter;
  let db: Pool;
  const pools: Pool[] = [];
  const sweepers: EventRetentionSweeper[] = [];
  let logSpy: MockInstance<typeof console.log>;
  let errorSpy: MockInstance<typeof console.error>;

  // ─── Helpers ────────────────────────────────────────────────

  /** Inserts rows directly; `label` goes to session_id so each row can be named. */
  async function seed(rows: SeedRow[]): Promise<void> {
    if (rows.length === 0) return;
    await db.query(
      `INSERT INTO litemetrics_events (site_id, type, timestamp, session_id, visitor_id, bot_flag, event_name, user_id)
       SELECT * FROM unnest($1::text[], $2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])`,
      [
        rows.map((r) => r.site),
        rows.map((r) => r.type ?? 'pageview'),
        rows.map((r) => new Date(r.ts).toISOString()),
        rows.map((r) => r.label),
        rows.map((r) => r.visitor ?? 'visitor-1'),
        rows.map((r) => r.bot ?? null),
        rows.map((r) => (r.type === 'event' ? 'signup' : null)),
        rows.map((r) => (r.type === 'identify' ? 'user-1' : null)),
      ],
    );
  }

  async function labelsOf(site?: string): Promise<string[]> {
    const result = site === undefined
      ? await db.query<{ label: string }>('SELECT session_id AS label FROM litemetrics_events')
      : await db.query<{ label: string }>('SELECT session_id AS label FROM litemetrics_events WHERE site_id = $1', [site]);
    return result.rows.map((row) => row.label).sort();
  }

  async function countWhere(condition: string, values: unknown[]): Promise<number> {
    const result = await db.query<{ n: string }>(`SELECT count(*) AS n FROM litemetrics_events WHERE ${condition}`, values);
    return Number(result.rows[0]!.n);
  }

  const countBefore = (cutoff: number) => countWhere('timestamp < $1', [new Date(cutoff)]);
  const countFrom = (cutoff: number) => countWhere('timestamp >= $1', [new Date(cutoff)]);

  function storePool(extra: PoolConfig = {}): Pool {
    const pool = new Pool({ connectionString: TEST_URL, max: 2, ...extra });
    pool.on('error', () => {});
    pools.push(pool);
    return pool;
  }

  type SweeperSettings = Partial<EventRetentionSweeperOptions> & { now: () => number };

  function sweeperOn(store: EventRetentionStore, settings: SweeperSettings): EventRetentionSweeper {
    const sweeper = new EventRetentionSweeper(store, { retentionDays: N, ...settings });
    sweepers.push(sweeper);
    return sweeper;
  }

  /** Direct sweeps until one reports more: false or fails, capped at MAX_SWEEPS as an assertion. */
  async function sweepUntilDone(sweeper: EventRetentionSweeper): Promise<EventRetentionSweepResult[]> {
    const results: EventRetentionSweepResult[] = [];
    let finished = false;
    for (let i = 0; i < MAX_SWEEPS; i += 1) {
      const result = await sweeper.sweep();
      results.push(result);
      if (result.status !== 'ok' || !result.more) {
        finished = true;
        break;
      }
    }
    expect(finished, `sweeping did not finish within ${MAX_SWEEPS} sweeps`).toBe(true);
    return results;
  }

  const totalDeleted = (results: EventRetentionSweepResult[]) => results.reduce((sum, r) => sum + r.deleted, 0);

  /** Wraps a pool so every statement sent on a checked-out client is recorded, and pool.query is counted. */
  function recordStatements(pool: Pool): StatementLog {
    const log: StatementLog = { statements: [], poolQueries: 0 };
    const wrapped = new WeakSet<object>();
    const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
    const query = pool.query.bind(pool) as (...args: unknown[]) => unknown;
    (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      log.poolQueries += 1;
      return query(...args);
    };
    (pool as unknown as { connect: unknown }).connect = (...args: unknown[]) => {
      if (args.length > 0) return connect(...args);
      return (connect() as Promise<{ query: (...a: unknown[]) => unknown }>).then((client) => {
        if (!wrapped.has(client)) {
          wrapped.add(client);
          const clientQuery = client.query.bind(client);
          client.query = (...queryArgs: unknown[]) => {
            const [text, values] = queryArgs;
            log.statements.push({
              text: typeof text === 'string' ? text : String((text as { text?: unknown } | null)?.text ?? ''),
              values: Array.isArray(values) ? values : (text as { values?: unknown[] } | null)?.values,
            });
            return clientQuery(...queryArgs);
          };
        }
        return client;
      });
    };
    return log;
  }

  /** B3 and R3 (c): what every recorded statement must look like. */
  function expectStatementShape(log: StatementLog, siteIds: string[], cutoff: number): void {
    expect(log.poolQueries).toBe(0);
    const deletes = log.statements.filter((s) => /\bDELETE\b/i.test(s.text) && /\blitemetrics_events\b/i.test(s.text));
    expect(deletes.length).toBeGreaterThan(0);
    for (const statement of deletes) {
      expect(statement.text).toMatch(RETENTION_DELETE);
      expect(statement.text).toMatch(/\bORDER\s+BY\b/i);
      expect(statement.text).toMatch(/\bLIMIT\b/i);
      expect(statement.text).not.toMatch(/\bLIMIT\s+\d/i);
      expect(statement.values?.some((v) => typeof v === 'string' && siteIds.includes(v))).toBe(true);
    }
    const cutoffIso = new Date(cutoff).toISOString();
    for (const statement of log.statements) {
      expect(statement.text).not.toContain(cutoffIso);
      for (const siteId of siteIds) expect(statement.text).not.toContain(siteId);
    }
  }

  async function showStatementTimeout(pool: Pool): Promise<string> {
    const client = await pool.connect();
    try {
      const result = await client.query<{ statement_timeout: string }>('SHOW statement_timeout');
      return result.rows[0]!.statement_timeout;
    } finally {
      client.release();
    }
  }

  function pageview(siteId: string, timestamp: number, sessionId: string): EnrichedEvent {
    return {
      type: 'pageview',
      siteId,
      timestamp,
      sessionId,
      visitorId: 'visitor-live',
      url: 'https://app.example.test/pricing',
      title: 'Pricing',
      device: { type: 'desktop', browser: 'Chrome', os: 'macOS' },
      language: 'en-US',
    };
  }

  function codeOf(error: unknown): unknown {
    return (error as { code?: unknown } | undefined)?.code;
  }

  const realWait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

  async function pollUntil(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await realWait(100);
    }
    return check();
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  beforeAll(async () => {
    adapter = new PostgresAdapter(TEST_URL!);
    await adapter.init();
    db = new Pool({ connectionString: TEST_URL, max: 4 });
    db.on('error', () => {});
  }, SLOW);

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE litemetrics_events, litemetrics_identity_map, litemetrics_sites');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.useRealTimers();
    for (const sweeper of sweepers.splice(0)) await sweeper.close();
    for (const pool of pools.splice(0)) await pool.end();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (db) {
      await db.query('TRUNCATE TABLE litemetrics_events, litemetrics_identity_map, litemetrics_sites');
      await db.end();
    }
    if (adapter) await adapter.close();
  });

  // ─── R2: what a sweep deletes ───────────────────────────────

  it('R2 sweeping until done deletes exactly the rows strictly older than the cutoff, on registered, soft-deleted and unknown sites alike', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const registered = (await adapter.createSite({ name: 'Retention registered', type: 'web', domain: 'registered.example.test' })).siteId;
    const softDeleted = (await adapter.createSite({ name: 'Retention soft-deleted', type: 'web', domain: 'deleted.example.test' })).siteId;
    expect(await adapter.deleteSite(softDeleted)).toBe(true);
    const bystander = 'site-only-recent';
    const eligible: SeedRow[] = [];
    const kept: SeedRow[] = [];
    for (const site of [registered, softDeleted, HOSTILE_SITE]) {
      eligible.push(
        { site, ts: cutoff - 40 * DAY_MS, label: `${site}|old-pageview`, type: 'pageview' },
        { site, ts: cutoff - 3 * DAY_MS, label: `${site}|old-event-bot`, type: 'event', bot: 'signature' },
        { site, ts: cutoff - 3_600_000, label: `${site}|old-identify-bot`, type: 'identify', bot: 'heuristic' },
        { site, ts: cutoff - 1, label: `${site}|cutoff-minus-1ms`, type: 'event' },
      );
      kept.push(
        { site, ts: cutoff, label: `${site}|at-cutoff`, type: 'identify' },
        { site, ts: cutoff + 1, label: `${site}|cutoff-plus-1ms`, type: 'event', bot: 'velocity' },
        { site, ts: now - DAY_MS, label: `${site}|recent`, type: 'pageview', bot: 'rate-limit' },
        { site, ts: now + DAY_MS, label: `${site}|future`, type: 'pageview' },
      );
    }
    kept.push(
      { site: bystander, ts: cutoff, label: `${bystander}|at-cutoff` },
      { site: bystander, ts: now, label: `${bystander}|now`, type: 'identify' },
    );
    await seed([...eligible, ...kept]);

    const pool = storePool();
    const log = recordStatements(pool);
    const store = new PostgresEventRetentionStore(pool);
    const listed = await store.listSiteIdsWithEventsBefore(new Date(cutoff));
    expect([...listed].sort()).toEqual([registered, softDeleted, HOSTILE_SITE].sort());

    const results = await sweepUntilDone(sweeperOn(store, { now: () => now }));
    for (const result of results) expect(result.status).toBe('ok');
    expect(results.at(-1)!.more).toBe(false);
    expect(totalDeleted(results)).toBe(eligible.length);
    expect(await labelsOf()).toEqual(kept.map((r) => r.label).sort());
    expect(await store.listSiteIdsWithEventsBefore(new Date(cutoff))).toEqual([]);
    expectStatementShape(log, [registered, softDeleted, HOSTILE_SITE], cutoff);
  }, SLOW);

  it('R2 listSiteIdsWithEventsBefore lists each site with an eligible row once and returns [] when there is none', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const store = new PostgresEventRetentionStore(storePool());
    expect(await store.listSiteIdsWithEventsBefore(new Date(cutoff))).toEqual([]);
    await seed([
      { site: 'site-a', ts: cutoff - 5 * DAY_MS, label: 'a-1' },
      { site: 'site-a', ts: cutoff - DAY_MS, label: 'a-2' },
      { site: 'site-a', ts: cutoff - 1, label: 'a-3' },
      { site: 'site-b', ts: cutoff - 1, label: 'b-1' },
      { site: 'site-c', ts: cutoff, label: 'c-at-cutoff' },
      { site: 'site-d', ts: now, label: 'd-now' },
    ]);
    const listed = await store.listSiteIdsWithEventsBefore(new Date(cutoff));
    expect(listed).toHaveLength(2);
    expect([...listed].sort()).toEqual(['site-a', 'site-b']);
    expect(await store.listSiteIdsWithEventsBefore(new Date(cutoff - 10 * DAY_MS))).toEqual([]);
  }, SLOW);

  it('R2 databaseNow returns the database clock as a Date within a day of the host clock', async () => {
    const store = new PostgresEventRetentionStore(storePool());
    const value = await store.databaseNow();
    expect(value).toBeInstanceOf(Date);
    expect(Number.isFinite(value.getTime())).toBe(true);
    expect(Math.abs(value.getTime() - Date.now())).toBeLessThan(DAY_MS);
  }, SLOW);

  it('R2 a host clock two days ahead of the database fails the sweep and deletes nothing', async () => {
    const now = Date.now();
    await seed([
      { site: 'site-a', ts: now - (N + 5) * DAY_MS, label: 'skew-old' },
      { site: 'site-a', ts: now - N * DAY_MS + DAY_MS, label: 'skew-eligible-only-for-the-skewed-clock' },
    ]);
    const sweeper = sweeperOn(new PostgresEventRetentionStore(storePool()), { now: () => now + 2 * DAY_MS });
    const result = await sweeper.sweep();
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBeInstanceOf(RangeError);
    expect(await labelsOf()).toEqual(['skew-eligible-only-for-the-skewed-clock', 'skew-old']);
  }, SLOW);

  // ─── R3 (a): window semantics ───────────────────────────────

  it('R3 (a) a window covers [t0, t0 + windowMs) of one site and reports whether eligible rows remain', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    const t0 = cutoff - 10 * DAY_MS;
    const windowMs = 60_000;
    await seed([
      { site: 'site-a', ts: t0, label: 'a-t0' },
      { site: 'site-a', ts: t0 + 1_000, label: 'a-t0-plus-1s' },
      { site: 'site-a', ts: t0 + windowMs - 1, label: 'a-window-end-minus-1ms' },
      { site: 'site-a', ts: t0 + windowMs, label: 'a-next-window' },
      { site: 'site-a', ts: t0 + windowMs + 5, label: 'a-next-window-plus-5ms' },
      { site: 'site-a', ts: cutoff + 1, label: 'a-kept' },
      { site: 'site-b', ts: t0, label: 'b-t0' },
      { site: 'site-b', ts: t0 + 10, label: 'b-t0-plus-10ms' },
    ]);
    const store = new PostgresEventRetentionStore(storePool());
    const at = new Date(cutoff);
    expect(await store.deleteOldestWindow('site-a', at, windowMs)).toMatchObject({ deleted: 3, remaining: true });
    expect(await labelsOf('site-a')).toEqual(['a-kept', 'a-next-window', 'a-next-window-plus-5ms'].sort());
    expect(await labelsOf('site-b')).toEqual(['b-t0', 'b-t0-plus-10ms'].sort());
    expect(await store.deleteOldestWindow('site-a', at, windowMs)).toMatchObject({ deleted: 2, remaining: false });
    expect(await store.deleteOldestWindow('site-a', at, windowMs)).toMatchObject({ deleted: 0, remaining: false });
    expect(await labelsOf('site-a')).toEqual(['a-kept']);
    expect(await labelsOf('site-b')).toEqual(['b-t0', 'b-t0-plus-10ms'].sort());
  }, SLOW);

  it('R3 (a) a window stops before the cutoff: cutoff - 1 ms goes, the cutoff and later stay', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    await seed([
      { site: 'site-a', ts: cutoff - 30_000, label: 'before-30s' },
      { site: 'site-a', ts: cutoff - 1, label: 'before-1ms' },
      { site: 'site-a', ts: cutoff, label: 'at-cutoff' },
      { site: 'site-a', ts: cutoff + 1, label: 'after-1ms' },
    ]);
    const store = new PostgresEventRetentionStore(storePool());
    expect(await store.deleteOldestWindow('site-a', new Date(cutoff), 3_600_000)).toMatchObject({ deleted: 2, remaining: false });
    expect(await labelsOf()).toEqual(['after-1ms', 'at-cutoff']);
  }, SLOW);

  it('R3 (a) a site without eligible rows, or without rows at all, gives deleted 0, remaining false', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    await seed([{ site: 'site-a', ts: cutoff, label: 'a-at-cutoff' }]);
    const store = new PostgresEventRetentionStore(storePool());
    expect(await store.deleteOldestWindow('site-a', new Date(cutoff), 3_600_000)).toMatchObject({ deleted: 0, remaining: false });
    expect(await store.deleteOldestWindow('site-none', new Date(cutoff), 3_600_000)).toMatchObject({ deleted: 0, remaining: false });
    expect(await labelsOf()).toEqual(['a-at-cutoff']);
  }, SLOW);

  it('R3 (a) a window holding more than maxRowsPerWindow rows is deleted over several calls, oldest first, each at most the cap', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    const base = cutoff - 5 * DAY_MS;
    await seed([
      ...Array.from({ length: 8 }, (_, i) => ({ site: 'site-a', ts: base + i, label: `dense-${i}` })),
      { site: 'site-a', ts: base + 2 * 3_600_000, label: 'later-window' },
    ]);
    const store = new PostgresEventRetentionStore(storePool(), { maxRowsPerWindow: 3 });
    const at = new Date(cutoff);
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 3, remaining: true });
    expect(await labelsOf()).toEqual(['dense-3', 'dense-4', 'dense-5', 'dense-6', 'dense-7', 'later-window']);
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 3, remaining: true });
    expect(await labelsOf()).toEqual(['dense-6', 'dense-7', 'later-window']);
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 2, remaining: true });
    expect(await labelsOf()).toEqual(['later-window']);
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 1, remaining: false });
    expect(await labelsOf()).toEqual([]);
  }, SLOW);

  it('R3 (a) rows sharing one timestamp are still capped per call', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    const ts = cutoff - DAY_MS;
    await seed(Array.from({ length: 5 }, (_, i) => ({ site: 'site-a', ts, label: `tie-${i}` })));
    const store = new PostgresEventRetentionStore(storePool(), { maxRowsPerWindow: 2 });
    const at = new Date(cutoff);
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 2, remaining: true });
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 2, remaining: true });
    expect(await store.deleteOldestWindow('site-a', at, 3_600_000)).toMatchObject({ deleted: 1, remaining: false });
    expect(await labelsOf()).toEqual([]);
  }, SLOW);

  it('B3 a site id with a quote, a semicolon, -- and a space is bound: its window touches only its own rows', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    await seed([
      { site: HOSTILE_SITE, ts: cutoff - 2 * DAY_MS, label: 'hostile-old' },
      { site: HOSTILE_SITE, ts: cutoff, label: 'hostile-at-cutoff' },
      { site: 'site-o', ts: cutoff - 2 * DAY_MS, label: 'prefix-old' },
    ]);
    const pool = storePool();
    const log = recordStatements(pool);
    const store = new PostgresEventRetentionStore(pool);
    expect(await store.deleteOldestWindow(HOSTILE_SITE, new Date(cutoff), 3_600_000)).toMatchObject({ deleted: 1, remaining: false });
    expect(await labelsOf()).toEqual(['hostile-at-cutoff', 'prefix-old']);
    expectStatementShape(log, [HOSTILE_SITE], cutoff);
  }, SLOW);

  it('B3 timestamps read back as strings (a host type-parser override) change neither the window bounds nor databaseNow', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    const t0 = cutoff - 3 * DAY_MS;
    const windowMs = 60_000;
    await seed([
      { site: 'site-a', ts: t0, label: 'w-t0' },
      { site: 'site-a', ts: t0 + windowMs - 1, label: 'w-end-minus-1ms' },
      { site: 'site-a', ts: t0 + windowMs, label: 'w-next-window' },
    ]);
    const stringTimestamps = {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        (oid === TIMESTAMPTZ_OID || oid === TIMESTAMP_OID
          ? (value: string) => value
          : pgTypes.getTypeParser(oid, format))) as typeof pgTypes.getTypeParser,
    };
    const pool = storePool({ types: stringTimestamps });
    const check = await pool.connect();
    try {
      const probe = await check.query<{ now: unknown }>('SELECT now() AS now');
      expect(typeof probe.rows[0]!.now).toBe('string');
    } finally {
      check.release();
    }
    const store = new PostgresEventRetentionStore(pool);
    const databaseNow = await store.databaseNow();
    expect(databaseNow).toBeInstanceOf(Date);
    expect(Math.abs(databaseNow.getTime() - Date.now())).toBeLessThan(DAY_MS);
    expect(await store.deleteOldestWindow('site-a', new Date(cutoff), windowMs)).toMatchObject({ deleted: 2, remaining: true });
    expect(await labelsOf()).toEqual(['w-next-window']);
  }, SLOW);

  // ─── R3 (b): transactions and statement timeouts ────────────

  it('R3 (b) the statement timeout is scoped to the call: the pooled connection comes back with its own setting', async () => {
    const cutoff = Date.now() - N * DAY_MS;
    await seed([
      { site: 'site-a', ts: cutoff - DAY_MS, label: 'a-old' },
      { site: 'site-a', ts: cutoff + DAY_MS, label: 'a-kept' },
    ]);
    const pool = storePool({ max: 1 });
    const before = await showStatementTimeout(pool);
    expect(before).not.toBe('1234ms');
    const store = new PostgresEventRetentionStore(pool, { statementTimeoutMs: 1_234 });
    await store.databaseNow();
    expect(await showStatementTimeout(pool)).toBe(before);
    await store.listSiteIdsWithEventsBefore(new Date(cutoff));
    expect(await showStatementTimeout(pool)).toBe(before);
    expect(await store.deleteOldestWindow('site-a', new Date(cutoff), 3_600_000)).toMatchObject({ deleted: 1, remaining: false });
    expect(await showStatementTimeout(pool)).toBe(before);
  }, SLOW);

  it('R3 (b) and R5 (c) a window that times out is rolled back whole, earlier windows stay deleted, and ingestion keeps working', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const base = cutoff - 2 * DAY_MS;
    const fast = Array.from({ length: 5 }, (_, i) => ({ site: 'site-slow', ts: base + i * 1_000, label: `fast-${i}` }));
    const slow = Array.from({ length: 40 }, (_, i) => ({ site: 'site-slow', ts: base + 2 * 3_600_000 + i * 10, label: `slow-${String(i).padStart(2, '0')}` }));
    await seed([...fast, ...slow, { site: 'site-slow', ts: now - DAY_MS, label: 'recent' }]);
    // Test scaffolding only: each deleted "slow-" row sleeps 50 ms, so that window
    // needs about 2 s and cannot finish within a 500 ms statement timeout.
    await db.query(`CREATE OR REPLACE FUNCTION lm_retention_test_slow_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.05); RETURN OLD; END $$`);
    await db.query(`CREATE TRIGGER lm_retention_test_slow_delete BEFORE DELETE ON litemetrics_events
      FOR EACH ROW WHEN (OLD.session_id LIKE 'slow-%') EXECUTE FUNCTION lm_retention_test_slow_delete()`);
    try {
      const pool = storePool({ max: 1 });
      const timeoutBefore = await showStatementTimeout(pool);
      const real = new PostgresEventRetentionStore(pool, { statementTimeoutMs: 500 });
      let windows = 0;
      let insertedDuring: Promise<void> | undefined;
      const store: EventRetentionStore = {
        databaseNow: () => real.databaseNow(),
        listSiteIdsWithEventsBefore: (at) => real.listSiteIdsWithEventsBefore(at),
        deleteOldestWindow: (siteId, at, windowMs) => {
          windows += 1;
          const window = real.deleteOldestWindow(siteId, at, windowMs);
          if (windows === 2) insertedDuring = adapter.insertEvents([pageview('site-slow', Date.now(), 'inserted-during-slow-window')]);
          return window;
        },
      };
      const result = await sweeperOn(store, { now: () => now }).sweep();
      expect(result).toMatchObject({ status: 'error', deleted: 5, more: true });
      expect(codeOf(result.error)).toBe('57014');
      expect(windows).toBe(2);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      await expect(insertedDuring).resolves.toBeUndefined();
      const left = await labelsOf('site-slow');
      expect(left.filter((label) => label.startsWith('fast-'))).toEqual([]);
      expect(left.filter((label) => label.startsWith('slow-'))).toEqual(slow.map((r) => r.label).sort());
      expect(left).toContain('inserted-during-slow-window');
      expect(left).toContain('recent');
      expect(await showStatementTimeout(pool)).toBe(timeoutBefore);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS lm_retention_test_slow_delete ON litemetrics_events');
      await db.query('DROP FUNCTION IF EXISTS lm_retention_test_slow_delete()');
    }
    // R3 (i): with the obstacle gone, a later sweep picks the backlog up.
    const results = await sweepUntilDone(sweeperOn(new PostgresEventRetentionStore(storePool()), { now: () => now }));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(await countBefore(cutoff)).toBe(0);
    expect(await labelsOf('site-slow')).toEqual(['inserted-during-slow-window', 'recent']);
  }, SLOW);

  // ─── R3 (d), (j): budget and connection use ─────────────────

  it('R3 (d) one sweep deletes between maxRowsPerSweep and maxRowsPerSweep + maxRowsPerWindow rows; repeated sweeps finish the job', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const sites = ['site-bulk-a', 'site-bulk-b'];
    // 1,500 eligible rows per site, one every 100 ms: 600 rows per 60 s window.
    await db.query(
      `INSERT INTO litemetrics_events (site_id, type, timestamp, session_id, visitor_id)
       SELECT s.site, 'pageview', $1::timestamptz + (g * 100) * interval '1 millisecond', s.site || '-old-' || g, 'visitor-' || (g % 40)
       FROM unnest($2::text[]) AS s(site), generate_series(0, 1499) AS g`,
      [new Date(cutoff - 2 * DAY_MS).toISOString(), sites],
    );
    await db.query(
      `INSERT INTO litemetrics_events (site_id, type, timestamp, session_id, visitor_id)
       SELECT s.site, 'pageview', $1::timestamptz + g * interval '1 second', s.site || '-kept-' || g, 'visitor-' || (g % 40)
       FROM unnest($2::text[]) AS s(site), generate_series(0, 199) AS g`,
      [new Date(cutoff).toISOString(), sites],
    );
    expect(await countBefore(cutoff)).toBe(3_000);
    expect(await countFrom(cutoff)).toBe(400);
    const store = new PostgresEventRetentionStore(storePool(), { maxRowsPerWindow: 300 });
    const sweeper = sweeperOn(store, { now: () => now, maxRowsPerSweep: 1_000, windowMs: 60_000 });
    const first = await sweeper.sweep();
    expect(first.status).toBe('ok');
    expect(first.more).toBe(true);
    expect(first.deleted).toBeGreaterThanOrEqual(1_000);
    expect(first.deleted).toBeLessThan(1_300);
    expect(await countBefore(cutoff)).toBe(3_000 - first.deleted);
    const rest = await sweepUntilDone(sweeper);
    expect(rest.every((r) => r.status === 'ok')).toBe(true);
    expect(rest.at(-1)!.more).toBe(false);
    expect(first.deleted + totalDeleted(rest)).toBe(3_000);
    expect(await countBefore(cutoff)).toBe(0);
    expect(await countFrom(cutoff)).toBe(400);
  }, SLOW);

  it('R3 (j) a full multi-site sweep runs on a pool of a single connection', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const rows: SeedRow[] = [];
    for (const site of ['site-a', 'site-b', 'site-c']) {
      rows.push(
        { site, ts: cutoff - 3 * DAY_MS, label: `${site}-w1` },
        { site, ts: cutoff - 2 * DAY_MS, label: `${site}-w2` },
        { site, ts: now - DAY_MS, label: `${site}-kept` },
      );
    }
    await seed(rows);
    const store = new PostgresEventRetentionStore(storePool({ max: 1 }), { statementTimeoutMs: 2_000 });
    const results = await sweepUntilDone(sweeperOn(store, { now: () => now }));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(totalDeleted(results)).toBe(6);
    expect(await labelsOf()).toEqual(['site-a-kept', 'site-b-kept', 'site-c-kept']);
  }, SLOW);

  // ─── R5 (c): ingestion during a sweep ───────────────────────

  it('R5 (c) insertEvents succeeds while a sweep is running', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    await seed([
      { site: 'site-a', ts: cutoff - 3 * DAY_MS, label: 'a-w1' },
      { site: 'site-a', ts: cutoff - 2 * DAY_MS, label: 'a-w2' },
      { site: 'site-a', ts: cutoff - DAY_MS, label: 'a-w3' },
    ]);
    const real = new PostgresEventRetentionStore(storePool());
    let inserted: Promise<void> | undefined;
    const store: EventRetentionStore = {
      databaseNow: () => real.databaseNow(),
      listSiteIdsWithEventsBefore: (at) => real.listSiteIdsWithEventsBefore(at),
      deleteOldestWindow: (siteId, at, windowMs) => {
        const window = real.deleteOldestWindow(siteId, at, windowMs);
        inserted ??= adapter.insertEvents([pageview('site-a', Date.now(), 'inserted-mid-sweep')]);
        return window;
      },
    };
    const results = await sweepUntilDone(sweeperOn(store, { now: () => now }));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(inserted).toBeDefined();
    await expect(inserted).resolves.toBeUndefined();
    expect(await labelsOf('site-a')).toEqual(['inserted-mid-sweep']);
  }, SLOW);

  // ─── R6: close in the middle of a sweep ─────────────────────

  it('R6 close() in the middle of a multi-window sweep ends it after the window in flight; a fresh sweeper finishes the job', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const rows: SeedRow[] = [];
    for (let w = 0; w < 6; w += 1) {
      for (let i = 0; i < 3; i += 1) rows.push({ site: 'site-a', ts: cutoff - 10 * DAY_MS + w * 2 * 3_600_000 + i, label: `a-w${w}-${i}` });
    }
    // Only site-a holds eligible rows, so the window order inside the sweep is fixed.
    rows.push(
      { site: 'site-a', ts: cutoff, label: 'a-kept-at-cutoff' },
      { site: 'site-b', ts: now, label: 'b-kept' },
    );
    await seed(rows);
    const real = new PostgresEventRetentionStore(storePool());
    let windowCalls = 0;
    let callsAfterClose = 0;
    let closed = false;
    let closing: Promise<void> | undefined;
    let sweeper: EventRetentionSweeper | undefined;
    const store: EventRetentionStore = {
      databaseNow: () => { if (closed) callsAfterClose += 1; return real.databaseNow(); },
      listSiteIdsWithEventsBefore: (at) => { if (closed) callsAfterClose += 1; return real.listSiteIdsWithEventsBefore(at); },
      deleteOldestWindow: (siteId, at, windowMs) => {
        if (closed) callsAfterClose += 1;
        windowCalls += 1;
        const window = real.deleteOldestWindow(siteId, at, windowMs);
        if (windowCalls === 2) queueMicrotask(() => { closed = true; closing = sweeper!.close(); });
        return window;
      },
    };
    sweeper = sweeperOn(store, { now: () => now });
    const result = await sweeper.sweep();
    await closing;
    expect(result).toMatchObject({ status: 'closed', deleted: 6, more: true });
    expect(windowCalls).toBe(2);
    expect(callsAfterClose).toBe(0);
    expect(await countBefore(cutoff)).toBe(18 - 6);
    const later = await sweeper.sweep();
    expect(later).toMatchObject({ status: 'closed', deleted: 0, more: true });
    expect(callsAfterClose).toBe(0);

    const results = await sweepUntilDone(sweeperOn(new PostgresEventRetentionStore(storePool()), { now: () => now }));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(totalDeleted(results)).toBe(12);
    expect(await countBefore(cutoff)).toBe(0);
    expect(await labelsOf()).toEqual(['a-kept-at-cutoff', 'b-kept']);
  }, SLOW);

  // ─── R7: blast radius ───────────────────────────────────────

  it('R7 sweeps delete only event rows: identity map, sites and the three aggregate tables keep their row counts', async () => {
    const now = Date.now();
    const cutoff = now - N * DAY_MS;
    const site = (await adapter.createSite({ name: 'Retention blast radius', type: 'web', domain: 'blast.example.test' })).siteId;
    await seed([
      { site, ts: cutoff - DAY_MS, label: 'r7-old-identify', visitor: 'visitor-expired', type: 'identify' },
      { site, ts: cutoff - 2 * DAY_MS, label: 'r7-old-pageview', visitor: 'visitor-expired' },
      { site, ts: now - DAY_MS, label: 'r7-recent', visitor: 'visitor-active' },
    ]);
    await adapter.upsertIdentity(site, 'visitor-expired', 'user-expired');
    await adapter.upsertIdentity(site, 'visitor-active', 'user-active');
    const snapshotId = `retention-r7-${now}`;
    // Seeded to survive the aggregate expiry sweep: ready, expiring two hours ahead.
    await db.query(
      `INSERT INTO litemetrics_aggregate_snapshots (id, site_id, scope_hash, state, created_at, expires_at, metadata)
       VALUES ($1, $2, 'retention-r7-scope', 'ready', now(), now() + interval '2 hours', '{}'::jsonb)`,
      [snapshotId, site],
    );
    await db.query(
      `INSERT INTO litemetrics_aggregate_snapshot_rows (snapshot_id, position, key, search_key, value, expires_at)
       VALUES ($1, 0, '/pricing', '/pricing', 12, now() + interval '2 hours'), ($1, 1, '/docs', '/docs', 7, now() + interval '2 hours')`,
      [snapshotId],
    );
    await db.query('INSERT INTO litemetrics_aggregate_snapshot_owners (site_id) VALUES ($1) ON CONFLICT DO NOTHING', [site]);
    const one = async (sql: string, values: unknown[] = []) => Number((await db.query<{ n: string }>(sql, values)).rows[0]!.n);
    const protectedCounts = async () => ({
      identity: await one('SELECT count(*) AS n FROM litemetrics_identity_map'),
      sites: await one('SELECT count(*) AS n FROM litemetrics_sites'),
      snapshots: await one('SELECT count(*) AS n FROM litemetrics_aggregate_snapshots WHERE id = $1', [snapshotId]),
      snapshotRows: await one('SELECT count(*) AS n FROM litemetrics_aggregate_snapshot_rows WHERE snapshot_id = $1', [snapshotId]),
      owners: await one('SELECT count(*) AS n FROM litemetrics_aggregate_snapshot_owners WHERE site_id = $1', [site]),
    });
    try {
      const before = await protectedCounts();
      expect(before).toEqual({ identity: 2, sites: 1, snapshots: 1, snapshotRows: 2, owners: 1 });
      const results = await sweepUntilDone(sweeperOn(new PostgresEventRetentionStore(storePool()), { now: () => now }));
      expect(totalDeleted(results)).toBe(2);
      expect(await labelsOf()).toEqual(['r7-recent']);
      expect(await protectedCounts()).toEqual(before);
      expect(await adapter.getUserIdForVisitor(site, 'visitor-expired')).toBe('user-expired');
    } finally {
      await db.query('DELETE FROM litemetrics_aggregate_snapshot_rows WHERE snapshot_id = $1', [snapshotId]);
      await db.query('DELETE FROM litemetrics_aggregate_snapshots WHERE id = $1', [snapshotId]);
      await db.query('DELETE FROM litemetrics_aggregate_snapshot_owners WHERE site_id = $1', [site]);
    }
  }, SLOW);

  // ─── R11: the adapter option end to end ─────────────────────

  it('R11 an adapter built with eventRetentionDays 30 sweeps on its first interval: 40-day rows go, 10-day rows stay', async () => {
    const now = Date.now();
    await seed([
      { site: 'site-a', ts: now - 40 * DAY_MS, label: 'r11-40d-a' },
      { site: 'site-b', ts: now - 40 * DAY_MS - 3_600_000, label: 'r11-40d-b', type: 'identify' },
      { site: 'site-a', ts: now - 10 * DAY_MS, label: 'r11-10d-a' },
      { site: 'site-b', ts: now - 10 * DAY_MS, label: 'r11-10d-b', type: 'event' },
    ]);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const enabled = new PostgresAdapter(TEST_URL!, { eventRetentionDays: 30 });
    let closed = false;
    try {
      await enabled.init();
      await realWait(500);
      expect(await labelsOf()).toEqual(['r11-10d-a', 'r11-10d-b', 'r11-40d-a', 'r11-40d-b']);
      vi.advanceTimersByTime(DEFAULT_EVENT_RETENTION_INTERVAL_MS);
      const sweepLines = () => logSpy.mock.calls
        .map((args) => args.map((part: unknown) => String(part)).join(' '))
        .filter((line) => line.startsWith('[event-retention] sweep '));
      // Wait for the rows to go and for the sweep to finish (its line), before closing.
      const swept = await pollUntil(async () => sweepLines().length > 0 && (await labelsOf()).length === 2, 20_000);
      expect(swept).toBe(true);
      expect(await labelsOf()).toEqual(['r11-10d-a', 'r11-10d-b']);
      expect(sweepLines().some((line) => / status=ok\b/.test(` ${line}`) && / deleted=2\b/.test(` ${line}`))).toBe(true);
      await expect(enabled.close()).resolves.toBeUndefined();
      closed = true;
    } finally {
      if (!closed) await enabled.close();
      vi.useRealTimers();
    }
  }, SLOW);
});
