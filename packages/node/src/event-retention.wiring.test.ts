import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';
import type { Pool } from 'pg';
import type { DBConfig } from '@litemetrics/core';

/**
 * DB-free wiring tests for event retention (contract R1, R3 (b), R4 (b), R6, R8, R11,
 * B3, B4, B6): what the Postgres adapter, the collector and the real Postgres store do
 * around a pool that records every statement it is sent.
 */

type DriverClient = {
  query: Mock<(text: unknown, values?: unknown[]) => Promise<unknown>>;
  release: Mock<(destroy?: boolean | Error) => void>;
};
interface DriverPool {
  options: unknown;
  clients: DriverClient[];
  connect: Mock<() => Promise<DriverClient>>;
  query: Mock<(text: unknown, values?: unknown[]) => Promise<unknown>>;
  end: Mock<() => Promise<void>>;
}

const driver = vi.hoisted(() => ({
  pools: [] as unknown[],
  statements: [] as Array<{ text: string; values?: unknown[] }>,
  failSql: null as RegExp | null,
  holdConnect: null as Promise<void> | null,
}));

// PostgreSQL is mocked so the adapter's own pool (built by `new Pool` in its
// constructor) is a recorder: every statement sent through the pool or a checked-out
// client is kept, so "no retention delete statement" is checked on what was sent. The
// aggregate capability's DDL is refused; by the adapter's existing design that leaves
// collection working and installs no 5 s aggregate expiry interval, so the fake clock
// can move 24 hours without unrelated timers firing.
vi.mock('pg', () => {
  const textOf = (text: unknown): string =>
    (typeof text === 'string' ? text : String((text as { text?: unknown } | null)?.text ?? ''));
  const run = async (text: unknown, values?: unknown[]) => {
    const sql = textOf(text);
    driver.statements.push({ text: sql, values: values ?? (text as { values?: unknown[] } | null)?.values });
    if (/litemetrics_aggregate/.test(sql)) throw new Error('aggregate capability unavailable in this fake');
    if (driver.failSql?.test(sql)) throw new Error('statement refused by this fake');
    return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
  };
  class Pool {
    options: unknown;
    clients: unknown[] = [];
    constructor(options: unknown) {
      this.options = options;
      driver.pools.push(this);
    }
    connect = vi.fn(async () => {
      if (driver.holdConnect) await driver.holdConnect;
      const client = { query: vi.fn(run), release: vi.fn() };
      this.clients.push(client);
      return client;
    });
    query = vi.fn(run);
    end = vi.fn(async () => {});
    on = vi.fn(() => this);
  }
  return { Pool, default: { Pool } };
});

const retention = vi.hoisted(() => ({
  stores: [] as unknown[],
  sweepers: [] as unknown[],
  ActualStore: undefined as unknown,
  ActualSweeper: undefined as unknown,
}));

// Both retention modules keep their real behaviour; only the two classes are wrapped
// in spies that construct the real class, so who builds them, how often and with what
// is observable from outside the adapter.
vi.mock('./event-retention', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-retention')>();
  retention.ActualSweeper = actual.EventRetentionSweeper;
  const EventRetentionSweeper = vi.fn(function spiedSweeper(
    ...args: ConstructorParameters<typeof actual.EventRetentionSweeper>
  ) {
    const sweeper = new actual.EventRetentionSweeper(...args);
    retention.sweepers.push(sweeper);
    return sweeper;
  });
  return { ...actual, EventRetentionSweeper };
});

vi.mock('./adapters/event-retention-postgres', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/event-retention-postgres')>();
  retention.ActualStore = actual.PostgresEventRetentionStore;
  const PostgresEventRetentionStore = vi.fn(function spiedStore(
    ...args: ConstructorParameters<typeof actual.PostgresEventRetentionStore>
  ) {
    const store = new actual.PostgresEventRetentionStore(...args);
    retention.stores.push(store);
    return store;
  });
  return { ...actual, PostgresEventRetentionStore };
});

const others = vi.hoisted(() => ({
  clickhouse: [] as unknown[][],
  mongodb: [] as unknown[][],
  closed: [] as string[],
}));

// The non-Postgres adapters are mocked so createCollector runs without a server; R8 is
// about what the collector does around their construction, not about their internals.
vi.mock('./adapters/clickhouse', () => ({
  ClickHouseAdapter: class {
    constructor(...args: unknown[]) { others.clickhouse.push(args); }
    init = async () => {};
    close = async () => { others.closed.push('clickhouse'); };
    listSites = async () => [];
  },
}));
vi.mock('./adapters/mongodb', () => ({
  MongoDBAdapter: class {
    constructor(...args: unknown[]) { others.mongodb.push(args); }
    init = async () => {};
    close = async () => { others.closed.push('mongodb'); };
    listSites = async () => [];
  },
}));

import { PostgresAdapter } from './adapters/postgres';
import { createCollector } from './collector';
import * as entry from './index';
import type { PostgresAdapterOptions } from './index';
import { DEFAULT_EVENT_RETENTION_INTERVAL_MS, EventRetentionSweeper } from './event-retention';
import {
  DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW,
  DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS,
  PostgresEventRetentionStore,
} from './adapters/event-retention-postgres';

const SweeperSpy = vi.mocked(EventRetentionSweeper);
const StoreSpy = vi.mocked(PostgresEventRetentionStore);
const RealStore = retention.ActualStore as typeof PostgresEventRetentionStore;
const RealSweeper = retention.ActualSweeper as typeof EventRetentionSweeper;

const DATABASE_URL = 'postgres://retention_reader:synthetic-password@postgres.example.test:5432/analytics_test';
const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const CUTOFF = new Date(NOW - 30 * DAY_MS);
const RETENTION_DELETE = /\bDELETE\s+FROM\s+litemetrics_events\b/i;

// ─── Helpers ──────────────────────────────────────────────────

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Tracked<T> = { settled: boolean; rejected: boolean; value?: T; error?: unknown };

function track<T>(promise: Promise<T>): Tracked<T> {
  const state: Tracked<T> = { settled: false, rejected: false };
  promise.then(
    (value) => { state.settled = true; state.value = value; },
    (error: unknown) => { state.settled = true; state.rejected = true; state.error = error; },
  );
  return state;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(0);
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  const state = track(promise);
  for (let i = 0; i < 50 && !state.settled; i += 1) await vi.advanceTimersByTimeAsync(0);
  if (!state.settled) throw new Error('promise did not settle while the fake clock stood still');
  return promise;
}

function printed(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((args) => format(...args));
}

function lastPool(): DriverPool {
  return driver.pools.at(-1) as DriverPool;
}

function retentionDeletes(): Array<{ text: string }> {
  return driver.statements.filter((statement) => RETENTION_DELETE.test(statement.text));
}

let intervalSpy: MockInstance<typeof setInterval>;

function retentionIntervals(): unknown[][] {
  return (intervalSpy.mock.calls as unknown[][]).filter((call) => call[1] === DEFAULT_EVENT_RETENTION_INTERVAL_MS);
}

const adapters: PostgresAdapter[] = [];

function adapterWith(options?: PostgresAdapterOptions): PostgresAdapter {
  const instance = options === undefined ? new PostgresAdapter(DATABASE_URL) : new PostgresAdapter(DATABASE_URL, options);
  adapters.push(instance);
  return instance;
}

function onlySweeper(): EventRetentionSweeper {
  expect(retention.sweepers).toHaveLength(1);
  return retention.sweepers[0] as EventRetentionSweeper;
}

let warnSpy: MockInstance<typeof console.warn>;
let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  driver.pools.length = 0;
  driver.statements.length = 0;
  driver.failSql = null;
  driver.holdConnect = null;
  retention.stores.length = 0;
  retention.sweepers.length = 0;
  others.clickhouse.length = 0;
  others.mongodb.length = 0;
  others.closed.length = 0;
  SweeperSpy.mockClear();
  StoreSpy.mockClear();
  intervalSpy = vi.spyOn(globalThis, 'setInterval');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});

afterEach(async () => {
  for (const instance of adapters.splice(0)) void instance.close();
  await flush();
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ─── R1: off by default ───────────────────────────────────────

describe('R1 off by default', () => {
  it.each([
    { label: 'option absent', options: undefined, warns: false },
    { label: 'eventRetentionDays: 0', options: { eventRetentionDays: 0 }, warns: false },
    { label: 'eventRetentionDays: 7 (invalid)', options: { eventRetentionDays: 7 }, warns: true },
  ])('R1 $label: no sweeper, no store, no timer and no retention delete over 24 hours', async ({ options, warns }) => {
    const instance = adapterWith(options);
    expect(driver.pools).toHaveLength(1);
    await settle(instance.init());
    // Positive control: the schema really went through this fake pool.
    expect(driver.statements.some((s) => /CREATE TABLE IF NOT EXISTS litemetrics_events\b/.test(s.text))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 3_600_000 + 60_000);
    expect(SweeperSpy).not.toHaveBeenCalled();
    expect(StoreSpy).not.toHaveBeenCalled();
    expect(retentionIntervals()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(retentionDeletes()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(warns ? 1 : 0);
  });

  it('R1 positive control: eventRetentionDays 30 builds the real store on the adapter pool and the sweeper with { retentionDays: 30 }', () => {
    const options: PostgresAdapterOptions = { eventRetentionDays: 30 };
    adapterWith(options);
    expect(driver.pools).toHaveLength(1);
    expect(StoreSpy).toHaveBeenCalledTimes(1);
    expect(StoreSpy.mock.calls[0]).toHaveLength(1);
    expect(StoreSpy.mock.calls[0]![0]).toBe(driver.pools[0]);
    expect(retention.stores[0]).toBeInstanceOf(RealStore);
    expect(SweeperSpy).toHaveBeenCalledTimes(1);
    expect(SweeperSpy.mock.calls[0]![0]).toBe(retention.stores[0]);
    expect(SweeperSpy.mock.calls[0]![1]).toEqual({ retentionDays: 30 });
    expect(onlySweeper()).toBeInstanceOf(RealSweeper);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([31, 365, 36_500])('R1 eventRetentionDays %s builds one sweeper with exactly that period', (days) => {
    adapterWith({ eventRetentionDays: days });
    expect(SweeperSpy).toHaveBeenCalledTimes(1);
    expect(SweeperSpy.mock.calls[0]![1]).toEqual({ retentionDays: days });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('R1 and R6 enabled: init() installs the timer, runs no sweep, and the first store call reaches the adapter pool one interval later', async () => {
    const instance = adapterWith({ eventRetentionDays: 30 });
    await settle(instance.init());
    const pool = lastPool();
    const afterInit = pool.connect.mock.calls.length;
    expect(retentionIntervals()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_INTERVAL_MS - 1);
    expect(pool.connect.mock.calls.length).toBe(afterInit);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(pool.connect.mock.calls.length).toBeGreaterThan(afterInit);
    // B3: every store statement runs on a checked-out client, never through pool.query.
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─── R4 (b): invalid library value ────────────────────────────

describe('R4 (b) invalid eventRetentionDays on the Postgres adapter', () => {
  it.each([
    { label: '7', value: 7 },
    { label: '29', value: 29 },
    { label: '36501', value: 36_501 },
    { label: '-30', value: -30 },
    { label: '30.5', value: 30.5 },
    { label: 'NaN', value: Number.NaN },
    { label: 'Infinity', value: Number.POSITIVE_INFINITY },
    { label: 'the string "120"', value: '120' },
    { label: 'null', value: null },
    { label: 'true', value: true },
  ])('R4 (b) $label warns once during construction, never throws, and keeps retention off', async ({ value }) => {
    const instance = adapterWith({ eventRetentionDays: value as unknown as number });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [warning] = printed(warnSpy);
    expect(warning!.startsWith('[event-retention] invalid ')).toBe(true);
    expect(warning).toContain(`eventRetentionDays=${String(value)}`);
    expect(warning).toContain('nothing will be deleted');
    await settle(instance.init());
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_INTERVAL_MS * 2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(SweeperSpy).not.toHaveBeenCalled();
    expect(StoreSpy).not.toHaveBeenCalled();
    expect(retentionIntervals()).toEqual([]);
    expect(retentionDeletes()).toEqual([]);
  });

  it('R4 (b) a value whose String() throws is reported as eventRetentionDays=unprintable', () => {
    expect(() => adapterWith({ eventRetentionDays: Object.create(null) as number })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [warning] = printed(warnSpy);
    expect(warning!.startsWith('[event-retention] invalid ')).toBe(true);
    expect(warning).toContain('eventRetentionDays=unprintable');
    expect(warning).toContain('nothing will be deleted');
    expect(SweeperSpy).not.toHaveBeenCalled();
  });
});

// ─── R6: adapter lifecycle ────────────────────────────────────

describe('R6 adapter lifecycle', () => {
  it('R6 init() starts the sweeper only after its schema statements, and a second init() installs no second timer', async () => {
    const instance = adapterWith({ eventRetentionDays: 30 });
    const sweeper = onlySweeper();
    const realStart = sweeper.start.bind(sweeper);
    let statementsAtStart: string[] | undefined;
    const start = vi.spyOn(sweeper, 'start').mockImplementation(() => {
      statementsAtStart ??= driver.statements.map((s) => s.text);
      realStart();
    });
    expect(start).not.toHaveBeenCalled();
    await settle(instance.init());
    expect(start).toHaveBeenCalledTimes(1);
    expect(statementsAtStart!.some((text) => /CREATE TABLE IF NOT EXISTS litemetrics_events\b/.test(text))).toBe(true);
    expect(statementsAtStart!.some((text) => /CREATE INDEX IF NOT EXISTS idx_litemetrics_identity_map_site_user/.test(text))).toBe(true);
    await settle(instance.init());
    expect(retentionIntervals()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('R6 an init() that throws starts no sweeper', async () => {
    driver.failSql = /CREATE TABLE IF NOT EXISTS litemetrics_events\b/;
    const instance = adapterWith({ eventRetentionDays: 30 });
    const start = vi.spyOn(onlySweeper(), 'start');
    await expect(settle(instance.init())).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
    expect(retentionIntervals()).toEqual([]);
    const connects = lastPool().connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_INTERVAL_MS * 2);
    expect(lastPool().connect.mock.calls.length).toBe(connects);
  });

  it('R6 close() awaits sweeper.close() before it ends the pool', async () => {
    const instance = adapterWith({ eventRetentionDays: 30 });
    await settle(instance.init());
    const sweeper = onlySweeper();
    const gate = deferred<void>();
    const realClose = sweeper.close.bind(sweeper);
    const close = vi.spyOn(sweeper, 'close').mockImplementation(async () => {
      await gate.promise;
      await realClose();
    });
    const closing = track(instance.close());
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(lastPool().end).not.toHaveBeenCalled();
    expect(closing.settled).toBe(false);
    gate.resolve();
    await flush();
    expect(lastPool().end).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R6 close() before init() finishes closes the sweeper, and the later init() completion starts nothing', async () => {
    const hold = deferred<void>();
    driver.holdConnect = hold.promise;
    const instance = adapterWith({ eventRetentionDays: 30 });
    const close = vi.spyOn(onlySweeper(), 'close');
    const initializing = track(instance.init());
    await flush();
    await settle(instance.close());
    expect(close).toHaveBeenCalledTimes(1);
    driver.holdConnect = null;
    hold.resolve();
    await flush();
    expect(initializing.settled).toBe(true);
    expect(retentionIntervals()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    const connects = lastPool().connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_INTERVAL_MS * 2);
    expect(lastPool().connect.mock.calls.length).toBe(connects);
    expect(retentionDeletes()).toEqual([]);
  });
});

// ─── R8: non-Postgres adapters ────────────────────────────────

describe('R8 non-Postgres adapters', () => {
  type WarnCase = { label: string; db: DBConfig; name: 'clickhouse' | 'mongodb'; shown: string };
  const CLICKHOUSE_URL = 'http://clickhouse.example.test:8123';
  const MONGODB_URL = 'mongodb://mongo.example.test:27017/analytics';

  it.each<WarnCase>([
    { label: 'clickhouse', db: { adapter: 'clickhouse', url: CLICKHOUSE_URL, eventRetentionDays: 30 }, name: 'clickhouse', shown: '30' },
    { label: 'an omitted adapter (clickhouse by default)', db: { url: CLICKHOUSE_URL, eventRetentionDays: 90 }, name: 'clickhouse', shown: '90' },
    { label: 'mongodb', db: { adapter: 'mongodb', url: MONGODB_URL, eventRetentionDays: 30 }, name: 'mongodb', shown: '30' },
    { label: 'mongodb with a value below the floor', db: { adapter: 'mongodb', url: MONGODB_URL, eventRetentionDays: 7 }, name: 'mongodb', shown: '7' },
    { label: 'clickhouse with a non-number', db: { adapter: 'clickhouse', url: CLICKHOUSE_URL, eventRetentionDays: '120' as unknown as number }, name: 'clickhouse', shown: '120' },
  ])('R8 $label with eventRetentionDays warns exactly once and still builds a working collector', async ({ db, name, shown }) => {
    const collector = await settle(createCollector({ db }));
    const warnings = printed(warnSpy);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.startsWith('[event-retention] unsupported ')).toBe(true);
    expect(warnings[0]).toContain(`adapter=${name}`);
    expect(warnings[0]).toContain(`eventRetentionDays=${shown}`);
    expect(warnings[0]).toContain('nothing will be deleted');
    expect(SweeperSpy).not.toHaveBeenCalled();
    expect(StoreSpy).not.toHaveBeenCalled();
    if (name === 'clickhouse') {
      // Constructor call unchanged: no new option reaches ClickHouse.
      expect(others.clickhouse).toEqual([[db.url, { aggregateSnapshotKeeperPath: undefined }]]);
      expect(Object.keys(others.clickhouse[0]![1] as object)).not.toContain('eventRetentionDays');
      expect(others.mongodb).toEqual([]);
    } else {
      expect(others.mongodb).toEqual([[db.url]]);
      expect(others.clickhouse).toEqual([]);
    }
    expect(await settle(collector.listSites())).toEqual([]);
    await settle(collector.close());
    expect(others.closed).toEqual([name]);
  });

  it('R8 a value whose String() throws is reported as eventRetentionDays=unprintable', async () => {
    const collector = await settle(createCollector({
      db: { adapter: 'clickhouse', url: CLICKHOUSE_URL, eventRetentionDays: Object.create(null) as number },
    }));
    const warnings = printed(warnSpy);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.startsWith('[event-retention] unsupported ')).toBe(true);
    expect(warnings[0]).toContain('adapter=clickhouse');
    expect(warnings[0]).toContain('eventRetentionDays=unprintable');
    expect(warnings[0]).toContain('nothing will be deleted');
    await settle(collector.close());
  });

  it.each([
    { adapter: 'clickhouse' as const, value: undefined },
    { adapter: 'clickhouse' as const, value: 0 },
    { adapter: 'mongodb' as const, value: undefined },
    { adapter: 'mongodb' as const, value: 0 },
  ])('R8 $adapter with eventRetentionDays $value emits no warning', async ({ adapter, value }) => {
    const collector = await settle(createCollector({ db: { adapter, url: CLICKHOUSE_URL, eventRetentionDays: value } }));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(others.clickhouse.length + others.mongodb.length).toBe(1);
    await settle(collector.close());
  });

  it('R8 and R11 postgres: no R8 warning, and the value reaches the sweeper through createAdapter', async () => {
    const collector = await settle(createCollector({ db: { adapter: 'postgres', url: DATABASE_URL, eventRetentionDays: 30 } }));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(StoreSpy).toHaveBeenCalledTimes(1);
    expect(StoreSpy.mock.calls[0]![0]).toBe(lastPool());
    expect(SweeperSpy).toHaveBeenCalledTimes(1);
    expect(SweeperSpy.mock.calls[0]![1]).toEqual({ retentionDays: 30 });
    expect(retentionIntervals()).toHaveLength(1);
    const close = vi.spyOn(onlySweeper(), 'close');
    await settle(collector.close());
    expect(close).toHaveBeenCalledTimes(1);
    expect(lastPool().end).toHaveBeenCalledTimes(1);
  });

  it('R8 and R11 postgres with an invalid value: exactly one warning in total, the invalid-value one', async () => {
    const collector = await settle(createCollector({ db: { adapter: 'postgres', url: DATABASE_URL, eventRetentionDays: 7 } }));
    const warnings = printed(warnSpy);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.startsWith('[event-retention] invalid ')).toBe(true);
    expect(warnings[0]).not.toContain('unsupported');
    expect(SweeperSpy).not.toHaveBeenCalled();
    await settle(collector.close());
  });

  it('R8 postgres with retention unset emits no warning and builds no sweeper', async () => {
    const collector = await settle(createCollector({ db: { adapter: 'postgres', url: DATABASE_URL } }));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(SweeperSpy).not.toHaveBeenCalled();
    expect(StoreSpy).not.toHaveBeenCalled();
    await settle(collector.close());
  });

  it('R8 an unknown adapter still throws the existing error and emits no retention warning', async () => {
    await expect(settle(createCollector({
      db: { adapter: 'sqlite' as never, url: 'file:analytics.db', eventRetentionDays: 30 },
    }))).rejects.toThrow('Unknown DB adapter: sqlite');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(driver.pools).toEqual([]);
  });
});

// ─── B6: package entry ────────────────────────────────────────

describe('B6 package entry', () => {
  it('B6 the entry re-exports PostgresAdapter but no runtime value of the retention modules', () => {
    expect(entry.PostgresAdapter).toBe(PostgresAdapter);
    const exported = Object.keys(entry);
    for (const name of [
      'EventRetentionSweeper', 'resolveEventRetentionDays', 'MIN_EVENT_RETENTION_DAYS', 'MAX_EVENT_RETENTION_DAYS',
      'DEFAULT_EVENT_RETENTION_INTERVAL_MS', 'DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP', 'DEFAULT_EVENT_RETENTION_WINDOW_MS',
      'EVENT_RETENTION_LOG_PREFIX', 'PostgresEventRetentionStore', 'DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS',
      'DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW',
    ]) {
      expect(exported).not.toContain(name);
    }
  });
});

// ─── R3 (b) and B3: the real Postgres store on a hand-made pool ──

type Reply = { rows: unknown[] } | { fail: unknown } | 'hang';
type HandClient = DriverClient & { index: number };
interface HandPool {
  pool: {
    connect: Mock<() => Promise<HandClient>>;
    query: Mock<(text: unknown, values?: unknown[]) => Promise<unknown>>;
    end: Mock<() => Promise<void>>;
    on: Mock<(...args: unknown[]) => unknown>;
  };
  asPool: Pool;
  clients: HandClient[];
  pending: Array<{ text: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }>;
  statements: Array<{ client: number; text: string; values?: unknown[]; afterRelease: boolean }>;
  makeClient: () => HandClient;
}

/**
 * A pool built by hand for the store alone: each checkout gets a fresh client whose
 * statements are recorded (with whether that client had already been released) and
 * answered by `reply`, which may also leave a statement hanging forever.
 */
function handPool(reply: (text: string) => Reply = () => ({ rows: [] })): HandPool {
  const clients: HandClient[] = [];
  const pending: HandPool['pending'] = [];
  const statements: HandPool['statements'] = [];
  const makeClient = (): HandClient => {
    const index = clients.length;
    const release = vi.fn<(destroy?: boolean | Error) => void>();
    const query = vi.fn<(text: unknown, values?: unknown[]) => Promise<unknown>>((text, values) => {
      const sql = typeof text === 'string' ? text : String((text as { text?: unknown } | null)?.text ?? '');
      statements.push({
        client: index,
        text: sql,
        values: values ?? (text as { values?: unknown[] } | null)?.values,
        afterRelease: release.mock.calls.length > 0,
      });
      const answer = reply(sql);
      if (answer === 'hang') return new Promise((resolve, reject) => { pending.push({ text: sql, resolve, reject }); });
      if ('fail' in answer) return Promise.reject(answer.fail);
      return Promise.resolve({ rows: answer.rows, rowCount: answer.rows.length, command: 'SELECT', oid: 0, fields: [] });
    });
    const client: HandClient = { index, query, release };
    clients.push(client);
    return client;
  };
  const pool = {
    connect: vi.fn<() => Promise<HandClient>>(async () => makeClient()),
    query: vi.fn<(text: unknown, values?: unknown[]) => Promise<unknown>>(async () => {
      throw new Error('pool.query is outside the store API surface');
    }),
    end: vi.fn<() => Promise<void>>(async () => {}),
    on: vi.fn<(...args: unknown[]) => unknown>(),
  };
  return { pool, asPool: pool as unknown as Pool, clients, pending, statements, makeClient };
}

type StoreCallName = 'databaseNow' | 'listSiteIdsWithEventsBefore' | 'deleteOldestWindow';

function invoke(store: PostgresEventRetentionStore, name: StoreCallName): Promise<unknown> {
  if (name === 'databaseNow') return store.databaseNow();
  if (name === 'listSiteIdsWithEventsBefore') return store.listSiteIdsWithEventsBefore(CUTOFF);
  return store.deleteOldestWindow('site-a', CUTOFF, 3_600_000);
}

function sameInstant(value: unknown, instant: Date): boolean {
  if (value instanceof Date) return value.getTime() === instant.getTime();
  if (typeof value === 'string') return Date.parse(value) === instant.getTime();
  if (typeof value === 'number') return value === instant.getTime();
  return false;
}

function codeOf(error: unknown): unknown {
  return (error as { code?: unknown } | undefined)?.code;
}

const ORIGINAL = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
const TRANSACTION_CONTROL = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|SET|RESET|SHOW)\b/i;

/** BEGIN succeeds, every data or setting statement fails with ORIGINAL, ROLLBACK behaves as told. */
function failingAfterBegin(rollback: 'ok' | 'fail' | 'hang'): (text: string) => Reply {
  return (text) => {
    if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(text)) return { rows: [] };
    if (/^\s*ROLLBACK\b/i.test(text)) {
      if (rollback === 'ok') return { rows: [] };
      return rollback === 'fail' ? { fail: new Error('rollback failed') } : 'hang';
    }
    return { fail: ORIGINAL };
  };
}

describe('R3 (b) client-side deadline of the Postgres store', () => {
  it.each(['databaseNow', 'listSiteIdsWithEventsBefore', 'deleteOldestWindow'] as const)(
    'R3 (b) %s: a statement that never settles rejects with retention_client_deadline after statementTimeoutMs + 10 s and destroys its client',
    async (name) => {
      const fake = handPool(() => 'hang');
      const store = new RealStore(fake.asPool);
      const call = track(invoke(store, name));
      await flush();
      expect(fake.clients).toHaveLength(1);
      expect(fake.pending.length).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS + 10_000 - 1);
      expect(call.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(call.rejected).toBe(true);
      expect(call.error).toBeInstanceOf(Error);
      expect(codeOf(call.error)).toBe('retention_client_deadline');
      expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
      expect(fake.clients[0]!.release).toHaveBeenCalledWith(true);
      // A late result is ignored: no further statement and no second release.
      const sent = fake.statements.length;
      for (const late of fake.pending.splice(0)) late.resolve({ rows: [{ now: new Date(NOW) }], rowCount: 1 });
      await flush();
      expect(fake.statements.length).toBe(sent);
      expect(fake.statements.filter((s) => s.afterRelease)).toEqual([]);
      expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
      expect(fake.pool.query).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it('R3 (b) the deadline follows statementTimeoutMs (1 s gives 11 s), uses timers looked up at call time, and ignores a late rejection', async () => {
    vi.useRealTimers();
    const fake = handPool(() => 'hang');
    const store = new RealStore(fake.asPool, { statementTimeoutMs: 1_000 });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const call = track(store.deleteOldestWindow('site-a', CUTOFF, 3_600_000));
    await flush();
    await vi.advanceTimersByTimeAsync(10_999);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.rejected).toBe(true);
    expect(codeOf(call.error)).toBe('retention_client_deadline');
    expect(fake.clients[0]!.release).toHaveBeenCalledWith(true);
    for (const late of fake.pending.splice(0)) late.reject(new Error('late failure after the deadline'));
    await flush();
    expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
    expect(unhandled).toEqual([]);
  });

  it('R3 (b) a checkout that never resolves rejects with retention_client_deadline; a client checked out late is released at once', async () => {
    const checkout = deferred<HandClient>();
    const fake = handPool();
    fake.pool.connect.mockImplementation(() => checkout.promise);
    const store = new RealStore(fake.asPool);
    const call = track(store.listSiteIdsWithEventsBefore(CUTOFF));
    await flush();
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS + 10_000 - 1);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.rejected).toBe(true);
    expect(codeOf(call.error)).toBe('retention_client_deadline');
    const lateClient = fake.makeClient();
    checkout.resolve(lateClient);
    await flush();
    expect(lateClient.release).toHaveBeenCalledTimes(1);
    expect(lateClient.query).not.toHaveBeenCalled();
  });
});

describe('R3 (a), R3 (b) and B3 store rules on a hand-made pool', () => {
  it('B3 pins the store defaults', () => {
    expect(DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_WINDOW).toBe(5_000);
  });

  it.each([
    { statementTimeoutMs: 0 },
    { statementTimeoutMs: -1 },
    { statementTimeoutMs: 1.5 },
    { statementTimeoutMs: Number.NaN },
    { statementTimeoutMs: Number.POSITIVE_INFINITY },
    { statementTimeoutMs: 2_147_473_648 },
    { maxRowsPerWindow: 0 },
    { maxRowsPerWindow: -5 },
    { maxRowsPerWindow: 2.5 },
    { maxRowsPerWindow: Number.NaN },
    { maxRowsPerWindow: 2 ** 53 },
  ])('B3 store option %o throws RangeError', (options) => {
    expect(() => new RealStore(handPool().asPool, options)).toThrow(RangeError);
  });

  it('B3 the boundary options are accepted and construction sends nothing', () => {
    const fake = handPool();
    expect(() => new RealStore(fake.asPool, { statementTimeoutMs: 2_147_473_647, maxRowsPerWindow: 1 })).not.toThrow();
    expect(() => new RealStore(fake.asPool, { statementTimeoutMs: 1, maxRowsPerWindow: Number.MAX_SAFE_INTEGER })).not.toThrow();
    expect(() => new RealStore(fake.asPool)).not.toThrow();
    expect(fake.pool.connect).not.toHaveBeenCalled();
    expect(fake.pool.query).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, '3600000' as unknown as number])(
    'R3 (a) windowMs %s rejects with RangeError before any SQL',
    async (windowMs) => {
      const fake = handPool();
      const store = new RealStore(fake.asPool);
      await expect(settle(store.deleteOldestWindow('site-a', CUTOFF, windowMs))).rejects.toBeInstanceOf(RangeError);
      expect(fake.pool.connect).not.toHaveBeenCalled();
      expect(fake.statements).toEqual([]);
    },
  );

  it('R3 (b) a failed window statement is rolled back and the call rejects with the original error', async () => {
    const fake = handPool(failingAfterBegin('ok'));
    const store = new RealStore(fake.asPool);
    await expect(settle(store.deleteOldestWindow('site-a', CUTOFF, 3_600_000))).rejects.toBe(ORIGINAL);
    expect(fake.statements.some((s) => /^\s*ROLLBACK\b/i.test(s.text))).toBe(true);
    expect(fake.clients).toHaveLength(1);
    expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
    expect(fake.statements.filter((s) => s.afterRelease)).toEqual([]);
  });

  it('B3 a ROLLBACK that fails still rejects with the original error and destroys the connection', async () => {
    const fake = handPool(failingAfterBegin('fail'));
    const store = new RealStore(fake.asPool);
    await expect(settle(store.deleteOldestWindow('site-a', CUTOFF, 3_600_000))).rejects.toBe(ORIGINAL);
    expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
    expect(fake.clients[0]!.release).toHaveBeenCalledWith(true);
  });

  it('B3 a ROLLBACK that misses its client deadline rejects with the original error and destroys the connection', async () => {
    const fake = handPool(failingAfterBegin('hang'));
    const store = new RealStore(fake.asPool);
    const call = track(store.deleteOldestWindow('site-a', CUTOFF, 3_600_000));
    await flush();
    expect(call.settled).toBe(false);
    expect(fake.pending.some((p) => /^\s*ROLLBACK\b/i.test(p.text))).toBe(true);
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_STATEMENT_TIMEOUT_MS + 10_000);
    expect(call.rejected).toBe(true);
    expect(call.error).toBe(ORIGINAL);
    expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
    expect(fake.clients[0]!.release).toHaveBeenCalledWith(true);
  });

  it.each(['databaseNow', 'listSiteIdsWithEventsBefore'] as const)(
    'R3 (b) a failing %s statement rejects with the original error and releases its one connection once',
    async (name) => {
      const fake = handPool((text) => (TRANSACTION_CONTROL.test(text) ? { rows: [] } : { fail: ORIGINAL }));
      const store = new RealStore(fake.asPool);
      await expect(settle(invoke(store, name))).rejects.toBe(ORIGINAL);
      expect(fake.pool.connect).toHaveBeenCalledTimes(1);
      expect(fake.clients[0]!.release).toHaveBeenCalledTimes(1);
    },
  );

  it('B3 the site id and the cutoff are bound as parameters, never written into SQL text; one checkout and one release per call', async () => {
    const hostile = "site-o'brien; -- tail";
    const fake = handPool();
    const store = new RealStore(fake.asPool, { statementTimeoutMs: 1_234 });
    await settle(store.deleteOldestWindow(hostile, CUTOFF, 3_600_000)).catch(() => undefined);
    await settle(store.listSiteIdsWithEventsBefore(CUTOFF)).catch(() => undefined);
    await settle(store.databaseNow()).catch(() => undefined);
    expect(fake.statements.length).toBeGreaterThan(0);
    for (const statement of fake.statements) {
      expect(statement.text).not.toContain(hostile);
      expect(statement.text).not.toContain("o'brien");
      expect(statement.text).not.toContain(CUTOFF.toISOString());
      expect(statement.text).not.toContain(String(CUTOFF.getTime()));
    }
    expect(fake.statements.some((s) => s.values?.includes(hostile))).toBe(true);
    expect(fake.statements.some((s) => s.client === 1 && s.values?.some((v) => sameInstant(v, CUTOFF)))).toBe(true);
    expect(fake.pool.connect).toHaveBeenCalledTimes(3);
    for (const client of fake.clients) expect(client.release).toHaveBeenCalledTimes(1);
    expect(fake.statements.filter((s) => s.afterRelease)).toEqual([]);
    expect(fake.pool.query).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
