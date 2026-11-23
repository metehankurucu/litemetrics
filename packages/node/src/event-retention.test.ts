import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';
import {
  DEFAULT_EVENT_RETENTION_INTERVAL_MS,
  DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP,
  DEFAULT_EVENT_RETENTION_WINDOW_MS,
  EVENT_RETENTION_LOG_PREFIX,
  EventRetentionSweeper,
  MAX_EVENT_RETENTION_DAYS,
  MIN_EVENT_RETENTION_DAYS,
  resolveEventRetentionDays,
} from './event-retention';
import type {
  EventRetentionStore,
  EventRetentionSweepResult,
  EventRetentionSweeperOptions,
  EventRetentionWindowResult,
} from './event-retention';

/**
 * DB-free contract tests for the event retention sweeper (contract R2-R6, B2).
 *
 * The store is a scripted fake: it is the seam the contract defines so that
 * budget, overlap, logging and close rules can be checked without SQL. Every
 * fake store answers `databaseNow` within 24 hours of the sweeper clock unless a
 * test says otherwise. Timers are vitest fake timers; the sweeper clock is the
 * injected `now` unless a test is about the default clock.
 */

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const LINE_START = '[event-retention] sweep ';

let clock = NOW;

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

/** Lets every pending promise chain (and any zero-delay timer) run without moving the fake clock. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(0);
}

type WindowStep = EventRetentionWindowResult | (() => EventRetentionWindowResult | Promise<EventRetentionWindowResult>);

interface StoreScript {
  databaseNow?: () => Date | Promise<Date>;
  sites?: string[] | (() => string[] | Promise<string[]>);
  windows?: Record<string, WindowStep[]>;
}

interface FakeStore extends EventRetentionStore {
  databaseNow: Mock<() => Promise<Date>>;
  listSiteIdsWithEventsBefore: Mock<(cutoff: Date) => Promise<string[]>>;
  deleteOldestWindow: Mock<(siteId: string, cutoff: Date, windowMs: number) => Promise<EventRetentionWindowResult>>;
  /** Store calls in call order: 'databaseNow', 'list' or 'window:<siteId>'. */
  order: string[];
  /** Largest number of store calls that were in flight at the same time. */
  maxInFlight: number;
}

function fakeStore(script: StoreScript = {}): FakeStore {
  const queues = new Map<string, WindowStep[]>(
    Object.entries(script.windows ?? {}).map(([site, steps]) => [site, [...steps]]),
  );
  let inFlight = 0;
  const order: string[] = [];
  const state = { maxInFlight: 0 };
  const tracked = async <T>(label: string, run: () => T | Promise<T>): Promise<T> => {
    order.push(label);
    inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, inFlight);
    try {
      return await run();
    } finally {
      inFlight -= 1;
    }
  };
  const store = {
    order,
    get maxInFlight() { return state.maxInFlight; },
    databaseNow: vi.fn<() => Promise<Date>>(() =>
      tracked('databaseNow', () => (script.databaseNow ? script.databaseNow() : new Date(clock)))),
    listSiteIdsWithEventsBefore: vi.fn<(cutoff: Date) => Promise<string[]>>(() =>
      tracked('list', () => {
        const sites = script.sites ?? [];
        return Array.isArray(sites) ? [...sites] : sites();
      })),
    deleteOldestWindow: vi.fn<(siteId: string, cutoff: Date, windowMs: number) => Promise<EventRetentionWindowResult>>(
      (siteId) => tracked(`window:${siteId}`, () => {
        const step = queues.get(siteId)?.shift();
        if (step === undefined) return { deleted: 0, remaining: false };
        return typeof step === 'function' ? step() : { ...step };
      }),
    ),
  };
  return store as FakeStore;
}

function totalStoreCalls(store: FakeStore): number {
  return store.databaseNow.mock.calls.length
    + store.listSiteIdsWithEventsBefore.mock.calls.length
    + store.deleteOldestWindow.mock.calls.length;
}

function windowSites(store: FakeStore): string[] {
  return store.deleteOldestWindow.mock.calls.map(([siteId]) => siteId);
}

type SweeperOverrides = Partial<EventRetentionSweeperOptions>;

const sweepers: EventRetentionSweeper[] = [];

/** A sweeper on the injected test clock with N = 30 unless overridden. Closed after each test. */
function sweeperFor(store: EventRetentionStore, overrides: SweeperOverrides = {}): EventRetentionSweeper {
  const sweeper = new EventRetentionSweeper(store, { retentionDays: 30, now: () => clock, ...overrides });
  sweepers.push(sweeper);
  return sweeper;
}

let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;
let warnSpy: MockInstance<typeof console.warn>;
let infoSpy: MockInstance<typeof console.info>;

/** What the console would print for each call: the formatted arguments of one call is one line. */
function printed(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((args) => format(...args));
}

function logLines(): string[] { return printed(logSpy); }
function errorLines(): string[] { return printed(errorSpy); }

/**
 * Awaits a sweeper promise while letting zero-delay timers run, without moving the
 * fake clock. Fails fast (instead of timing out) when it cannot settle that way.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const state = track(promise);
  for (let i = 0; i < 50 && !state.settled; i += 1) await vi.advanceTimersByTimeAsync(0);
  if (!state.settled) throw new Error('promise did not settle while the fake clock stood still');
  return promise;
}

/** `count` windows of `deleted` rows that leave rows behind, then an optional last step. */
function steady(deleted: number, count: number, last?: EventRetentionWindowResult): WindowStep[] {
  const steps: WindowStep[] = Array.from({ length: count }, () => ({ deleted, remaining: true }));
  if (last) steps.push(last);
  return steps;
}

/** Reads `key=value` from a sweep line, ignoring the free-text `error="..."` tail. */
function token(line: string, key: string): string | undefined {
  const tail = line.indexOf(' error="');
  const head = tail === -1 ? line : line.slice(0, tail);
  const match = head.match(new RegExp(`(?:^|\\s)${key}=(\\S+)`));
  return match?.[1];
}

/** The `error="..."` value; it must be the last token of the line. */
function errorText(line: string): string | undefined {
  return line.match(/ error="([^"]*)"$/)?.[1];
}

function expectLineMatches(line: string, result: EventRetentionSweepResult): void {
  expect(line.startsWith(LINE_START)).toBe(true);
  expect(line.startsWith(`${EVENT_RETENTION_LOG_PREFIX} sweep `)).toBe(true);
  expect(line).not.toMatch(/[\r\n]/);
  expect(token(line, 'status')).toBe(result.status);
  expect(token(line, 'deleted')).toBe(String(result.deleted));
  expect(token(line, 'cutoff')).toBe(result.cutoff.toISOString());
  expect(token(line, 'duration_ms')).toMatch(/^\d+$/);
  expect(token(line, 'duration_ms')).toBe(String(result.durationMs));
  expect(token(line, 'more')).toBe(String(result.more));
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  clock = NOW;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});

afterEach(async () => {
  // close() never rejects (R6); a sweeper left with a store call that never settles
  // keeps its close() pending, which is harmless here.
  for (const sweeper of sweepers.splice(0)) void sweeper.close();
  await flush();
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ─── R4 (b): resolveEventRetentionDays ────────────────────────

describe('R4 (b) resolveEventRetentionDays', () => {
  it('R4 (b) pins the documented bounds', () => {
    expect(MIN_EVENT_RETENTION_DAYS).toBe(30);
    expect(MAX_EVENT_RETENTION_DAYS).toBe(36_500);
  });

  it.each([
    { label: 'undefined', value: undefined },
    { label: '0', value: 0 },
    { label: '-0', value: -0 },
  ])('R4 (b) step 1: $label is disabled', ({ value }) => {
    expect(resolveEventRetentionDays(value)).toEqual({ status: 'disabled' });
  });

  it.each([
    { label: 'NaN', value: Number.NaN },
    { label: 'Infinity', value: Number.POSITIVE_INFINITY },
    { label: '-Infinity', value: Number.NEGATIVE_INFINITY },
    { label: 'fraction 30.5', value: 30.5 },
    { label: 'fraction 36499.9', value: 36_499.9 },
    { label: 'fraction 0.5', value: 0.5 },
    { label: 'numeric string "120"', value: '120' },
    { label: 'numeric string "30"', value: '30' },
    { label: 'numeric string "0"', value: '0' },
    { label: 'empty string', value: '' },
    { label: 'null', value: null },
    { label: 'true', value: true },
    { label: 'false', value: false },
    { label: 'plain object', value: {} },
    { label: 'array [30]', value: [30] },
    { label: 'boxed Number(30)', value: new Number(30) },
    { label: 'bigint 30n', value: 30n },
  ])('R4 (b) step 2: $label is invalid (not an integer number)', ({ value }) => {
    expect(resolveEventRetentionDays(value)).toEqual({ status: 'invalid' });
  });

  it.each([1, 7, 29, -1, -30, -36_500, 36_501, 100_000, Number.MAX_SAFE_INTEGER, 1e21])(
    'R4 (b) step 3: %s is invalid (outside 30..36500)',
    (value) => {
      expect(resolveEventRetentionDays(value)).toEqual({ status: 'invalid' });
    },
  );

  it.each([30, 31, 90, 365, 36_499, 36_500])('R4 (b) step 4: %s is enabled with that many days', (value) => {
    expect(resolveEventRetentionDays(value)).toEqual({ status: 'enabled', days: value });
  });

  it('R4 (b) is pure: no console output for any input', () => {
    for (const value of [undefined, 0, 7, 30, 36_501, Number.NaN, '120', null, {}]) resolveEventRetentionDays(value);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

// ─── B2: sweeper construction ─────────────────────────────────

describe('B2 EventRetentionSweeper constructor validation', () => {
  it.each([
    { label: '0 (disabled)', value: 0 },
    { label: '29', value: 29 },
    { label: '36501', value: 36_501 },
    { label: '30.5', value: 30.5 },
    { label: 'NaN', value: Number.NaN },
    { label: 'undefined', value: undefined as unknown as number },
    { label: 'string "30"', value: '30' as unknown as number },
  ])('B2 retentionDays $label throws RangeError', ({ value }) => {
    expect(() => new EventRetentionSweeper(fakeStore(), { retentionDays: value })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, Number.MAX_SAFE_INTEGER + 2])(
    'B2 intervalMs %s throws RangeError',
    (value) => {
      expect(() => new EventRetentionSweeper(fakeStore(), { retentionDays: 30, intervalMs: value })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('B2 maxRowsPerSweep %s throws RangeError', (value) => {
    expect(() => new EventRetentionSweeper(fakeStore(), { retentionDays: 30, maxRowsPerSweep: value })).toThrow(RangeError);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('B2 windowMs %s throws RangeError', (value) => {
    expect(() => new EventRetentionSweeper(fakeStore(), { retentionDays: 30, windowMs: value })).toThrow(RangeError);
  });

  it('B2 accepts the boundary values and does nothing at construction', () => {
    const store = fakeStore();
    sweeperFor(store, { retentionDays: 30, intervalMs: 1, maxRowsPerSweep: 1, windowMs: 1 });
    sweeperFor(store, { retentionDays: 36_500, intervalMs: 2_147_483_647, maxRowsPerSweep: Number.MAX_SAFE_INTEGER, windowMs: Number.MAX_SAFE_INTEGER });
    expect(totalStoreCalls(store)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ─── R2: cutoff ───────────────────────────────────────────────

describe('R2 cutoff', () => {
  it.each([30, 45, 36_500])(
    'R2 cutoff is now() - %s days, the same instant for every store call of the sweep and the result',
    async (days) => {
      const store = fakeStore({
        sites: ['site-a', 'site-b'],
        windows: {
          'site-a': [{ deleted: 2, remaining: true }, { deleted: 1, remaining: false }],
          'site-b': [{ deleted: 3, remaining: false }],
        },
      });
      const result = await settle(sweeperFor(store, { retentionDays: days }).sweep());
      const expected = NOW - days * DAY_MS;
      const cutoffs = [
        ...store.listSiteIdsWithEventsBefore.mock.calls.map(([cutoff]) => cutoff),
        ...store.deleteOldestWindow.mock.calls.map(([, cutoff]) => cutoff),
        result.cutoff,
      ];
      expect(cutoffs).toHaveLength(5);
      for (const cutoff of cutoffs) {
        expect(cutoff).toBeInstanceOf(Date);
        expect(cutoff.getTime()).toBe(expected);
      }
      expect(result).toMatchObject({ status: 'ok', deleted: 6, more: false });
    },
  );

  it('R2 cutoff comes from the sweeper clock, not from databaseNow', async () => {
    const store = fakeStore({
      databaseNow: () => new Date(NOW - 23 * 3_600_000),
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 1, remaining: false }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result.status).toBe('ok');
    expect(result.cutoff.getTime()).toBe(NOW - 30 * DAY_MS);
    expect(store.listSiteIdsWithEventsBefore.mock.calls[0]![0].getTime()).toBe(NOW - 30 * DAY_MS);
  });

  it('R2 cutoff is computed once at the start: a clock moving during the sweep does not move it', async () => {
    const bump = (result: EventRetentionWindowResult): WindowStep => () => { clock += 60_000; return result; };
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [bump({ deleted: 1, remaining: true }), bump({ deleted: 1, remaining: false })],
        'site-b': [bump({ deleted: 1, remaining: false })],
      },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(store.deleteOldestWindow.mock.calls.map(([, cutoff]) => cutoff.getTime()))
      .toEqual([NOW - 30 * DAY_MS, NOW - 30 * DAY_MS, NOW - 30 * DAY_MS]);
    expect(result.cutoff.getTime()).toBe(NOW - 30 * DAY_MS);
    // R5 (d): the duration is measured on the same clock, start to end.
    expect(result.durationMs).toBe(180_000);
  });

  it('R2 every sweep computes its own cutoff from the clock at its start', async () => {
    const store = fakeStore({ sites: ['site-a'] });
    const sweeper = sweeperFor(store);
    const first = await settle(sweeper.sweep());
    clock = NOW + 3_600_000;
    const second = await settle(sweeper.sweep());
    expect(first.cutoff.getTime()).toBe(NOW - 30 * DAY_MS);
    expect(second.cutoff.getTime()).toBe(NOW + 3_600_000 - 30 * DAY_MS);
    expect(store.listSiteIdsWithEventsBefore.mock.calls[1]![0].getTime()).toBe(NOW + 3_600_000 - 30 * DAY_MS);
  });

  it('R2 without options.now the sweeper reads the global Date.now() at each use, not at construction', async () => {
    const store = fakeStore({
      databaseNow: () => new Date(Date.now()),
      sites: ['site-a'],
      windows: { 'site-a': [() => { vi.setSystemTime(Date.now() + 2_500); return { deleted: 1, remaining: false }; }] },
    });
    const sweeper = new EventRetentionSweeper(store, { retentionDays: 30 });
    sweepers.push(sweeper);
    const later = NOW + 5 * DAY_MS;
    vi.setSystemTime(later);
    const result = await settle(sweeper.sweep());
    expect(result.status).toBe('ok');
    expect(result.cutoff.getTime()).toBe(later - 30 * DAY_MS);
    expect(result.durationMs).toBe(2_500);
  });
});

// ─── R2: clock check ──────────────────────────────────────────

describe('R2 clock check', () => {
  it('R2 databaseNow is the first store call of every sweep, called once per sweep', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 1, remaining: true }, { deleted: 1, remaining: false }],
        'site-b': [{ deleted: 1, remaining: false }],
      },
    });
    const sweeper = sweeperFor(store);
    await settle(sweeper.sweep());
    expect(store.order).toEqual(['databaseNow', 'list', 'window:site-a', 'window:site-a', 'window:site-b']);
    await settle(sweeper.sweep());
    expect(store.databaseNow).toHaveBeenCalledTimes(2);
    expect(store.order[5]).toBe('databaseNow');
  });

  it.each([
    { label: '2 days ahead', offset: 2 * DAY_MS },
    { label: '2 days behind', offset: -2 * DAY_MS },
  ])('R2 a database clock $label fails the sweep before any other store call', async ({ offset }) => {
    const databaseNow = new Date(NOW + offset);
    const store = fakeStore({
      databaseNow: () => databaseNow,
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 5, remaining: false }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBeInstanceOf(RangeError);
    const message = (result.error as RangeError).message;
    expect(message).toContain(new Date(NOW).toISOString());
    expect(message).toContain(databaseNow.toISOString());
    expect(result.cutoff.getTime()).toBe(NOW - 30 * DAY_MS);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
    expectLineMatches(errorLines()[0]!, result);
    expect(token(errorLines()[0]!, 'error_class')).toBe('RangeError');
  });

  it.each([
    { label: 'exactly 1 day ahead', offset: DAY_MS, status: 'ok' },
    { label: 'exactly 1 day behind', offset: -DAY_MS, status: 'ok' },
    { label: '1 day + 1 ms ahead', offset: DAY_MS + 1, status: 'error' },
    { label: '1 day + 1 ms behind', offset: -DAY_MS - 1, status: 'error' },
  ])('R2 clock check boundary: a database clock $label gives $status', async ({ offset, status }) => {
    const store = fakeStore({
      databaseNow: () => new Date(NOW + offset),
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 1, remaining: false }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result.status).toBe(status);
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(status === 'ok' ? 1 : 0);
    expect(result.deleted).toBe(status === 'ok' ? 1 : 0);
  });

  it.each([
    { label: 'databaseNow is an invalid Date', databaseNow: () => new Date(Number.NaN), now: () => clock },
    { label: 'now() is NaN', databaseNow: () => new Date(NOW), now: () => Number.NaN },
    { label: 'now() is Infinity', databaseNow: () => new Date(NOW), now: () => Number.POSITIVE_INFINITY },
  ])('R2 clock check fails closed when $label', async ({ databaseNow, now }) => {
    const store = fakeStore({ databaseNow, sites: ['site-a'], windows: { 'site-a': [{ deleted: 5, remaining: false }] } });
    const result = await settle(sweeperFor(store, { now }).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBeInstanceOf(RangeError);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
    expect(errorLines()[0]!.startsWith(LINE_START)).toBe(true);
    expect(token(errorLines()[0]!, 'status')).toBe('error');
  });

  it('R2 clock check validates the reading the cutoff came from, even when the clock steps back during databaseNow', async () => {
    // The first read (used for the cutoff) is 2 days fast; the clock is corrected before any later read.
    let calls = 0;
    const now = () => (calls++ === 0 ? NOW + 2 * DAY_MS : NOW);
    const store = fakeStore({
      databaseNow: () => new Date(NOW),
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 5, remaining: false }] },
    });
    const result = await settle(sweeperFor(store, { now }).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBeInstanceOf(RangeError);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
  });
});

// ─── R3 (d): budget ───────────────────────────────────────────

describe('R3 (d) budget', () => {
  it('R3 (d) window calls stop at the first running total >= maxRowsPerSweep', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': steady(7, 10) } });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 20 }).sweep());
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: 'ok', deleted: 21, more: true });
  });

  it('R3 (d) a running total landing exactly on the budget starts no further window', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': steady(5, 10) } });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 20 }).sweep());
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ status: 'ok', deleted: 20, more: true });
  });

  it('R3 (d) a running total one row below the budget still starts the next window', async () => {
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 19, remaining: true }, { deleted: 6, remaining: true }, { deleted: 6, remaining: true }] },
    });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 20 }).sweep());
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ deleted: 25, more: true });
  });

  it('R3 (d) the budget is global across sites, not per site', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b', 'site-c'],
      windows: {
        'site-a': [{ deleted: 4, remaining: true }, { deleted: 4, remaining: false }],
        'site-b': steady(4, 5),
        'site-c': steady(4, 5),
      },
    });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 10 }).sweep());
    expect(windowSites(store)).toEqual(['site-a', 'site-a', 'site-b']);
    expect(result).toMatchObject({ status: 'ok', deleted: 12, more: true });
  });

  it('R3 (d) the default budget is DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP (20,000 rows)', async () => {
    expect(DEFAULT_EVENT_RETENTION_MAX_ROWS_PER_SWEEP).toBe(20_000);
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': steady(5_000, 10) } });
    const result = await settle(sweeperFor(store).sweep());
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ deleted: 20_000, more: true });
  });

  it('R3 (d) an uninterrupted sweep below the budget deletes every eligible row the store reports', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 10, remaining: true }, { deleted: 10, remaining: true }, { deleted: 5, remaining: false }],
        'site-b': [{ deleted: 3, remaining: false }],
      },
    });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 100 }).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 28, more: false });
  });
});

// ─── R3 (e): iteration ────────────────────────────────────────

describe('R3 (e) iteration', () => {
  it('R3 (e) sites are processed in the order the store lists them', async () => {
    const store = fakeStore({
      sites: ['site-c', 'site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 1, remaining: false }],
        'site-b': [{ deleted: 1, remaining: false }],
        'site-c': [{ deleted: 1, remaining: false }],
      },
    });
    await settle(sweeperFor(store).sweep());
    expect(windowSites(store)).toEqual(['site-c', 'site-a', 'site-b']);
  });

  it('R3 (e) a site keeps getting windows until one resolves remaining: false', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': steady(2, 2, { deleted: 2, remaining: false }),
        'site-b': [{ deleted: 1, remaining: false }],
      },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(windowSites(store)).toEqual(['site-a', 'site-a', 'site-a', 'site-b']);
    expect(result).toMatchObject({ deleted: 7, more: false });
  });

  it('R3 (e) a window that deleted nothing moves on to the next site and is never repeated', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 0, remaining: true }, { deleted: 50, remaining: false }],
        'site-b': [{ deleted: 2, remaining: false }],
      },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(windowSites(store)).toEqual(['site-a', 'site-b']);
    expect(result).toMatchObject({ status: 'ok', deleted: 2, more: true });
  });

  it('R3 (e) every window gets the default windowMs (DEFAULT_EVENT_RETENTION_WINDOW_MS, 1 hour)', async () => {
    expect(DEFAULT_EVENT_RETENTION_WINDOW_MS).toBe(3_600_000);
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': steady(1, 1, { deleted: 1, remaining: false }), 'site-b': [{ deleted: 1, remaining: false }] },
    });
    await settle(sweeperFor(store).sweep());
    expect(store.deleteOldestWindow.mock.calls.map(([, , windowMs]) => windowMs)).toEqual([3_600_000, 3_600_000, 3_600_000]);
  });

  it('R3 (e) a custom windowMs is passed to every window', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': steady(1, 1, { deleted: 1, remaining: false }), 'site-b': [{ deleted: 1, remaining: false }] },
    });
    await settle(sweeperFor(store, { windowMs: 90_000 }).sweep());
    expect(store.deleteOldestWindow.mock.calls.map(([, , windowMs]) => windowMs)).toEqual([90_000, 90_000, 90_000]);
  });
});

// ─── R3 (f): more ─────────────────────────────────────────────

describe('R3 (f) more', () => {
  it('R3 (f) more is false when every listed site ended with remaining: false', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': [{ deleted: 3, remaining: false }], 'site-b': [{ deleted: 0, remaining: false }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 3, more: false });
  });

  it('R3 (f) an empty site list gives ok, deleted 0, more false and no window', async () => {
    const store = fakeStore({ sites: [] });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 0, more: false });
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
  });

  it('R3 (f) the budget reached on the window that finished the last site still gives more false', async () => {
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 10, remaining: true }, { deleted: 10, remaining: false }] },
    });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 20 }).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 20, more: false });
  });

  it('R3 (f) the budget reached while a listed site is not yet visited gives more true', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': [{ deleted: 10, remaining: true }, { deleted: 10, remaining: false }], 'site-b': [{ deleted: 1, remaining: false }] },
    });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 20 }).sweep());
    expect(windowSites(store)).toEqual(['site-a', 'site-a']);
    expect(result).toMatchObject({ status: 'ok', deleted: 20, more: true });
  });

  it('R3 (f) a site that ended on deleted: 0, remaining: true gives more true', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': [{ deleted: 1, remaining: false }], 'site-b': [{ deleted: 0, remaining: true }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 1, more: true });
  });
});

// ─── R3 (g): schedule ─────────────────────────────────────────

describe('R3 (g) schedule', () => {
  it('R3 (g) start() runs no sweep; the first sweep starts exactly intervalMs after start()', async () => {
    const store = fakeStore();
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    sweeper.start();
    await flush();
    expect(totalStoreCalls(store)).toBe(0);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(totalStoreCalls(store)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.order[0]).toBe('databaseNow');
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    await flush();
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });

  it('R3 (g) the default interval is DEFAULT_EVENT_RETENTION_INTERVAL_MS (10 minutes)', async () => {
    expect(DEFAULT_EVENT_RETENTION_INTERVAL_MS).toBe(600_000);
    const store = fakeStore();
    sweeperFor(store).start();
    await vi.advanceTimersByTimeAsync(599_999);
    expect(totalStoreCalls(store)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });

  it('R3 (g) later sweeps run every intervalMs counted from start()', async () => {
    const store = fakeStore({ sites: ['site-a'] });
    sweeperFor(store, { intervalMs: 60_000 }).start();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(store.databaseNow).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.databaseNow).toHaveBeenCalledTimes(4);
  });

  it('R3 (g) a second start() installs no second timer and starts no sweep', async () => {
    const store = fakeStore();
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    expect(vi.getTimerCount()).toBe(0);
    sweeper.start();
    expect(vi.getTimerCount()).toBe(1);
    sweeper.start();
    expect(vi.getTimerCount()).toBe(1);
    await flush();
    expect(totalStoreCalls(store)).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });

  it('R3 (g) the timer is a repeating interval of intervalMs that is unref()ed', () => {
    const fakeSetInterval = globalThis.setInterval;
    const unrefed: number[] = [];
    const intervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
      const handle = fakeSetInterval(handler, ms);
      const unref = handle.unref.bind(handle);
      handle.unref = () => { unrefed.push(ms ?? -1); return unref(); };
      return handle;
    }) as unknown as typeof setInterval);
    sweeperFor(fakeStore(), { intervalMs: 60_000 }).start();
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy.mock.calls[0]![1]).toBe(60_000);
    expect(unrefed).toEqual([60_000]);
  });

  it('R3 (g) a direct sweep() works before start() and does not move the schedule after it', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [{ deleted: 2, remaining: false }] } });
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    const before = await settle(sweeper.sweep());
    expect(before).toMatchObject({ status: 'ok', deleted: 2, more: false });
    sweeper.start();
    await vi.advanceTimersByTimeAsync(30_000);
    const between = await settle(sweeper.sweep());
    expect(between.status).toBe('ok');
    expect(store.databaseNow).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(3);
  });

  it('B2 timers are looked up when needed: fake timers installed after construction drive the schedule', async () => {
    vi.useRealTimers();
    const store = fakeStore();
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sweeper.start();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });
});

// ─── R3 (h): no overlap ───────────────────────────────────────

describe('R3 (h) no overlap', () => {
  it('R3 (h) a timer tick during an in-flight sweep is skipped, not queued', async () => {
    const gate = deferred<string[]>();
    let lists = 0;
    const store = fakeStore({ sites: () => { lists += 1; return lists === 1 ? gate.promise : []; } });
    sweeperFor(store, { intervalMs: 60_000 }).start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(1);
    gate.resolve([]);
    await flush();
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(2);
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(2);
  });

  it('R3 (h) sweep() during an in-flight sweep resolves to the same result object and adds no store call', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [{ deleted: 2, remaining: true }, () => gate.promise] } });
    const sweeper = sweeperFor(store);
    const first = sweeper.sweep();
    await flush();
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(2);
    const calls = totalStoreCalls(store);
    const second = sweeper.sweep();
    await flush();
    expect(totalStoreCalls(store)).toBe(calls);
    gate.resolve({ deleted: 3, remaining: false });
    const [a, b] = await Promise.all([settle(first), settle(second)]);
    expect(b).toBe(a);
    expect(a).toMatchObject({ status: 'ok', deleted: 5, more: false });
    expect(totalStoreCalls(store)).toBe(calls);
    expect(logLines()).toHaveLength(1);
  });

  it('R3 (h) sweep() during the clock check joins the in-flight sweep', async () => {
    const gate = deferred<Date>();
    let checks = 0;
    const store = fakeStore({
      databaseNow: () => { checks += 1; return checks === 1 ? gate.promise : new Date(clock); },
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 1, remaining: false }] },
    });
    const sweeper = sweeperFor(store);
    const first = sweeper.sweep();
    await flush();
    const second = sweeper.sweep();
    await flush();
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    gate.resolve(new Date(NOW));
    const [a, b] = await Promise.all([settle(first), settle(second)]);
    expect(b).toBe(a);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(1);
  });

  it('R3 (h) a timer tick during a direct sweep() starts no second sweep', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [() => gate.promise] } });
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    sweeper.start();
    const direct = sweeper.sweep();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(1);
    gate.resolve({ deleted: 1, remaining: false });
    await settle(direct);
    await flush();
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });

  it('R3 (h) once the in-flight sweep resolved, sweep() starts a fresh sweep with a new result', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [{ deleted: 1, remaining: false }] } });
    const sweeper = sweeperFor(store);
    const a = await settle(sweeper.sweep());
    const b = await settle(sweeper.sweep());
    expect(b).not.toBe(a);
    expect(store.databaseNow).toHaveBeenCalledTimes(2);
    expect(a).toMatchObject({ status: 'ok', deleted: 1, more: false });
    expect(b).toMatchObject({ status: 'ok', deleted: 0, more: false });
  });
});

// ─── R3 (i) and (j): resumption and connection use ────────────

describe('R3 (i) resumption and R3 (j) one store call at a time', () => {
  it('R3 (i) a later sweep re-lists sites and follows what the store reports, not saved progress', async () => {
    let lists = 0;
    const store = fakeStore({
      sites: () => { lists += 1; return lists === 1 ? ['site-a', 'site-b'] : ['site-b', 'site-a']; },
      windows: { 'site-a': steady(10, 5), 'site-b': steady(10, 5) },
    });
    const sweeper = sweeperFor(store, { maxRowsPerSweep: 20 });
    const first = await settle(sweeper.sweep());
    expect(first).toMatchObject({ deleted: 20, more: true });
    expect(windowSites(store)).toEqual(['site-a', 'site-a']);
    const second = await settle(sweeper.sweep());
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(2);
    expect(windowSites(store).slice(2)).toEqual(['site-b', 'site-b']);
    expect(second).toMatchObject({ deleted: 20, more: true });
  });

  it('R3 (j) the sweeper never has more than one store call in flight', async () => {
    const slow = (result: EventRetentionWindowResult): WindowStep => async () => {
      await Promise.resolve();
      await Promise.resolve();
      return result;
    };
    const store = fakeStore({
      sites: ['site-a', 'site-b', 'site-c'],
      windows: {
        'site-a': [slow({ deleted: 1, remaining: true }), slow({ deleted: 1, remaining: false })],
        'site-b': [slow({ deleted: 1, remaining: false })],
        'site-c': [slow({ deleted: 1, remaining: false })],
      },
    });
    const sweeper = sweeperFor(store);
    const [a, b] = await Promise.all([settle(sweeper.sweep()), settle(sweeper.sweep())]);
    expect(b).toBe(a);
    expect(a.deleted).toBe(4);
    expect(totalStoreCalls(store)).toBe(6);
    expect(store.maxInFlight).toBe(1);
  });
});

// ─── R5 (b): sweep line ───────────────────────────────────────

class RetentionProbeError extends Error {}
const AnonymousError = Object.defineProperty(class extends Error {}, 'name', { value: '' });
const WeirdlyNamed = Object.defineProperty(class {}, 'name', { value: 'Weird Name"é' });

const errorClassCases = [
  { label: 'an Error with a string code', thrown: (): unknown => Object.assign(new Error('connection reset by peer'), { code: 'ECONNRESET' }), errorClass: 'ECONNRESET', message: 'connection reset by peer' },
  { label: 'an Error with an empty code', thrown: (): unknown => Object.assign(new Error('empty code'), { code: '' }), errorClass: 'Error', message: 'empty code' },
  { label: 'a TypeError with a numeric code', thrown: (): unknown => Object.assign(new TypeError('numeric code'), { code: 42 }), errorClass: 'TypeError', message: 'numeric code' },
  { label: 'an Error subclass', thrown: (): unknown => new RetentionProbeError('probe failed'), errorClass: 'RetentionProbeError', message: 'probe failed' },
  { label: 'a code with spaces, a quote and non-ASCII', thrown: (): unknown => Object.assign(new Error('odd code'), { code: 'E BAD"é\tCODE' }), errorClass: 'EBADCODE', message: 'odd code' },
  { label: 'a code made only of removed characters', thrown: (): unknown => Object.assign(new Error('blank code'), { code: ' "é' }), errorClass: 'unknown', message: 'blank code' },
  { label: 'an Error subclass with an empty name', thrown: (): unknown => new AnonymousError('anonymous failure'), errorClass: 'unknown', message: 'anonymous failure' },
  { label: 'a constructor name with a space and a quote', thrown: (): unknown => new WeirdlyNamed(), errorClass: 'WeirdName', message: '[object Object]' },
  { label: 'a plain object with a code', thrown: (): unknown => ({ code: 'E_PLAIN', message: 'not an Error' }), errorClass: 'E_PLAIN', message: '[object Object]' },
  { label: 'an object whose String() throws', thrown: (): unknown => ({ toString() { throw new Error('no string'); } }), errorClass: 'Object', message: 'unknown' },
  { label: 'a null-prototype object', thrown: (): unknown => Object.create(null), errorClass: 'unknown', message: 'unknown' },
  { label: 'a thrown string', thrown: (): unknown => 'plain\nstring failure', errorClass: 'unknown', message: 'plain string failure' },
  { label: 'a thrown number', thrown: (): unknown => 42, errorClass: 'unknown', message: '42' },
  { label: 'null', thrown: (): unknown => null, errorClass: 'unknown', message: 'null' },
  { label: 'undefined', thrown: (): unknown => undefined, errorClass: 'unknown', message: 'undefined' },
];

const messageCases = [
  {
    label: 'each control character becomes one space and each double quote an apostrophe',
    raw: 'a\nb\rc\td\u0000e\u001ff\u007fg\u0085h\u009fi"j k',
    expected: "a b c d e f g h i'j k",
  },
  { label: 'runs are not collapsed and the ends are not trimmed', raw: '\n\nx\r\n', expected: '  x  ' },
  { label: 'exactly 160 code units are kept whole', raw: 'm'.repeat(160), expected: 'm'.repeat(160) },
  { label: '161 code units are cut to 160 with no marker', raw: 'm'.repeat(161), expected: 'm'.repeat(160) },
  {
    label: 'the cut counts UTF-16 code units, not characters',
    raw: `x${'\u{1F600}'.repeat(100)}`,
    expected: `x${'\u{1F600}'.repeat(100)}`.slice(0, 160),
  },
  { label: 'quotes are replaced before the cut', raw: '"'.repeat(200), expected: "'".repeat(160) },
];

describe('R5 (b) sweep line', () => {
  it('R5 (b) a sweep that deleted rows writes exactly one console.log line with the pinned tokens', async () => {
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': steady(3, 4, { deleted: 3, remaining: false }), 'site-b': [{ deleted: 2, remaining: false }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'ok', deleted: 17, more: false });
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(6);
    expect(errorLines()).toEqual([]);
    expect(logLines()).toHaveLength(1);
    expectLineMatches(logLines()[0]!, result);
    expect(token(logLines()[0]!, 'cutoff')).toBe(new Date(NOW - 30 * DAY_MS).toISOString());
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('R5 (b) a sweep stopped by the budget writes more=true', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': steady(6, 5) } });
    const result = await settle(sweeperFor(store, { maxRowsPerSweep: 10 }).sweep());
    expect(logLines()).toHaveLength(1);
    expectLineMatches(logLines()[0]!, result);
    expect(token(logLines()[0]!, 'more')).toBe('true');
    expect(token(logLines()[0]!, 'deleted')).toBe('12');
  });

  it.each([
    { label: 'no site listed', script: { sites: [] } satisfies StoreScript },
    { label: 'every window deleted 0, remaining: false', script: { sites: ['site-a'], windows: { 'site-a': [{ deleted: 0, remaining: false }] } } satisfies StoreScript },
    { label: 'a window deleted 0, remaining: true', script: { sites: ['site-a'], windows: { 'site-a': [{ deleted: 0, remaining: true }] } } satisfies StoreScript },
  ])('R5 (b) a sweep that deleted nothing and did not fail writes no line ($label)', async ({ script }) => {
    const store = fakeStore(script);
    const result = await settle(sweeperFor(store).sweep());
    expect(result.status).toBe('ok');
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
    expect(logLines()).toEqual([]);
    expect(errorLines()).toEqual([]);
  });

  it('R5 (b) and (d) duration_ms is the sweep duration on the sweeper clock', async () => {
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [() => { clock += 1_234; return { deleted: 1, remaining: false }; }] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result.durationMs).toBe(1_234);
    expect(token(logLines()[0]!, 'duration_ms')).toBe('1234');
  });

  it('R5 (b) an error sweep writes exactly one console.error line, no console.log line, error last', async () => {
    const failure = Object.assign(new Error('window "b" failed\nbadly'), { code: 'E_WINDOW' });
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 4, remaining: true }, () => Promise.reject(failure)] },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 4, more: true });
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
    const line = errorLines()[0]!;
    expectLineMatches(line, result);
    expect(token(line, 'error_class')).toBe('E_WINDOW');
    expect(line.endsWith(` error="window 'b' failed badly"`)).toBe(true);
  });

  it.each(errorClassCases)('R5 (b) error_class=$errorClass for $label', async ({ thrown, errorClass, message }) => {
    const failure = thrown();
    const store = fakeStore({ sites: () => Promise.reject(failure) });
    const result = await settle(sweeperFor(store).sweep());
    expect(result.status).toBe('error');
    expect(result.error).toBe(failure);
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
    const line = errorLines()[0]!;
    expectLineMatches(line, result);
    expect(token(line, 'error_class')).toBe(errorClass);
    expect(errorText(line)).toBe(message);
  });

  it.each(messageCases)('R5 (b) error message: $label', async ({ raw, expected }) => {
    const store = fakeStore({ sites: () => Promise.reject(new Error(raw)) });
    await settle(sweeperFor(store).sweep());
    expect(errorLines()).toHaveLength(1);
    const line = errorLines()[0]!;
    expect(line).not.toMatch(/[\r\n]/);
    expect(line.endsWith(`error="${expected}"`)).toBe(true);
    expect(errorText(line)).toBe(expected);
  });
});

// ─── R5 (c): containment ──────────────────────────────────────

type StoreMethod = 'databaseNow' | 'listSiteIdsWithEventsBefore' | 'deleteOldestWindow';

/** One sweep whose `method` fails with `failure`, by rejecting or by throwing synchronously. */
async function failingSweep(method: StoreMethod, mode: 'reject' | 'throw', failure: Error) {
  logSpy.mockClear();
  errorSpy.mockClear();
  const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': steady(2, 3) } });
  const fail = mode === 'reject' ? () => Promise.reject(failure) : () => { throw failure; };
  if (method === 'deleteOldestWindow') {
    const original = store.deleteOldestWindow.getMockImplementation()!;
    let windows = 0;
    store.deleteOldestWindow.mockImplementation((siteId, cutoff, windowMs) => {
      windows += 1;
      return windows === 1 ? original(siteId, cutoff, windowMs) : fail();
    });
  } else {
    (store[method] as unknown as Mock<() => Promise<unknown>>).mockImplementation(fail);
  }
  const result = await settle(sweeperFor(store).sweep());
  return { result, store, errors: errorLines(), logs: logLines() };
}

describe('R5 (c) containment', () => {
  it('R5 (c) a rejected site listing resolves the sweep with status error, deleted 0, more true', async () => {
    const failure = new Error('listing failed');
    const store = fakeStore({ sites: () => Promise.reject(failure) });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBe(failure);
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(errorLines()).toHaveLength(1);
  });

  it('R5 (c) a window failing mid-way keeps the committed count and starts no further window or site', async () => {
    const failure = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 3, remaining: true }, { deleted: 4, remaining: true }, () => Promise.reject(failure), { deleted: 9, remaining: false }],
        'site-b': [{ deleted: 1, remaining: false }],
      },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 7, more: true });
    expect(result.error).toBe(failure);
    expect(windowSites(store)).toEqual(['site-a', 'site-a', 'site-a']);
    expect(logLines()).toEqual([]);
    expect(errorLines()).toHaveLength(1);
    const line = errorLines()[0]!;
    expectLineMatches(line, result);
    expect(token(line, 'error_class')).toBe('57014');
    expect(errorText(line)).toBe('canceling statement due to statement timeout');
  });

  it('R5 (c) a failure on a later site keeps the rows committed on earlier sites', async () => {
    const failure = new Error('site-b failed');
    const store = fakeStore({
      sites: ['site-a', 'site-b', 'site-c'],
      windows: {
        'site-a': [{ deleted: 5, remaining: false }],
        'site-b': [() => Promise.reject(failure)],
        'site-c': [{ deleted: 1, remaining: false }],
      },
    });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 5, more: true });
    expect(windowSites(store)).toEqual(['site-a', 'site-b']);
  });

  it('R5 (c) a rejected databaseNow resolves with status error and lists no site', async () => {
    const failure = new Error('clock read failed');
    const store = fakeStore({ databaseNow: () => Promise.reject(failure), sites: ['site-a'] });
    const result = await settle(sweeperFor(store).sweep());
    expect(result).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(result.error).toBe(failure);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
    expect(errorLines()).toHaveLength(1);
  });

  it.each(['databaseNow', 'listSiteIdsWithEventsBefore', 'deleteOldestWindow'] as const)(
    'R5 (c) %s throwing synchronously is handled exactly like a rejection',
    async (method) => {
      const failure = new Error(`${method} failed`);
      const rejected = await failingSweep(method, 'reject', failure);
      const thrown = await failingSweep(method, 'throw', failure);
      for (const outcome of [rejected, thrown]) {
        expect(outcome.result).toMatchObject({ status: 'error', deleted: method === 'deleteOldestWindow' ? 2 : 0, more: true });
        expect(outcome.result.error).toBe(failure);
        expect(outcome.logs).toEqual([]);
        expect(outcome.errors).toHaveLength(1);
      }
      expect(thrown.errors).toEqual(rejected.errors);
      expect(thrown.store.deleteOldestWindow.mock.calls.length).toBe(rejected.store.deleteOldestWindow.mock.calls.length);
      expect(thrown.store.listSiteIdsWithEventsBefore.mock.calls.length).toBe(rejected.store.listSiteIdsWithEventsBefore.mock.calls.length);
    },
  );

  it('R5 (c) a failed timer-driven sweep is contained and the next tick runs a normal sweep', async () => {
    let lists = 0;
    const store = fakeStore({
      sites: () => { lists += 1; return lists === 1 ? Promise.reject(new Error('transient')) : ['site-a']; },
      windows: { 'site-a': [{ deleted: 3, remaining: false }] },
    });
    sweeperFor(store, { intervalMs: 60_000 }).start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(errorLines()).toHaveLength(1);
    expect(logLines()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(1);
    expect(logLines()).toHaveLength(1);
    expect(token(logLines()[0]!, 'status')).toBe('ok');
    expect(token(logLines()[0]!, 'deleted')).toBe('3');
    expect(unhandled).toEqual([]);
  });
});

// ─── R6: close() ──────────────────────────────────────────────

describe('R6 close()', () => {
  it('R6 close() during a blocked window resolves only after that window settles; nothing runs after it', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: {
        'site-a': [{ deleted: 4, remaining: true }, () => gate.promise, { deleted: 9, remaining: false }],
        'site-b': [{ deleted: 1, remaining: false }],
      },
    });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(2);
    const closing = track(sweeper.close());
    await flush();
    expect(closing.settled).toBe(false);
    expect(sweep.settled).toBe(false);
    gate.resolve({ deleted: 5, remaining: true });
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'closed', deleted: 9, more: true });
    expect(windowSites(store)).toEqual(['site-a', 'site-a']);
    const calls = totalStoreCalls(store);
    sweeper.start();
    await vi.advanceTimersByTimeAsync(DEFAULT_EVENT_RETENTION_INTERVAL_MS * 3);
    expect(totalStoreCalls(store)).toBe(calls);
  });

  it('R6 a closed sweep whose in-flight window finished its only site reports more: false', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [() => gate.promise] } });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    gate.resolve({ deleted: 2, remaining: false });
    await flush();
    expect(closing.settled).toBe(true);
    expect(sweep.value).toMatchObject({ status: 'closed', deleted: 2, more: false });
  });

  it('R6 a closed sweep with another listed site still waiting reports more: true', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': [() => gate.promise], 'site-b': [{ deleted: 1, remaining: false }] },
    });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    void sweeper.close();
    gate.resolve({ deleted: 2, remaining: false });
    await flush();
    expect(sweep.value).toMatchObject({ status: 'closed', deleted: 2, more: true });
    expect(windowSites(store)).toEqual(['site-a']);
  });

  it('R6 closing a timer-started sweep logs one status=closed line that counts the window in flight', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 6, remaining: true }, () => gate.promise, { deleted: 1, remaining: false }] },
    });
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    sweeper.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(2);
    const closing = track(sweeper.close());
    await flush();
    expect(closing.settled).toBe(false);
    gate.resolve({ deleted: 4, remaining: true });
    await flush();
    expect(closing.settled).toBe(true);
    expect(store.deleteOldestWindow).toHaveBeenCalledTimes(2);
    expect(errorLines()).toEqual([]);
    expect(logLines()).toHaveLength(1);
    const line = logLines()[0]!;
    expect(line.startsWith(LINE_START)).toBe(true);
    expect(token(line, 'status')).toBe('closed');
    expect(token(line, 'deleted')).toBe('10');
    expect(token(line, 'more')).toBe('true');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(store.databaseNow).toHaveBeenCalledTimes(1);
  });

  it('R6 an error from the window in flight during close() takes precedence over closed', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const failure = new Error('window failed while closing');
    const store = fakeStore({
      sites: ['site-a'],
      windows: { 'site-a': [{ deleted: 3, remaining: true }, () => gate.promise] },
    });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    gate.reject(failure);
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'error', deleted: 3, more: true });
    expect(sweep.value?.error).toBe(failure);
    expect(errorLines()).toHaveLength(1);
    expect(logLines()).toEqual([]);
  });

  it('R6 close() during the clock check: an in-tolerance clock gives closed, deleted 0, more true, no listing', async () => {
    const gate = deferred<Date>();
    const store = fakeStore({ databaseNow: () => gate.promise, sites: ['site-a'], windows: { 'site-a': [{ deleted: 1, remaining: false }] } });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    await flush();
    expect(closing.settled).toBe(false);
    gate.resolve(new Date(NOW));
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'closed', deleted: 0, more: true });
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(logLines()).toEqual([]);
    expect(errorLines()).toEqual([]);
  });

  it('R6 close() during the clock check: a failing clock check gives error', async () => {
    const gate = deferred<Date>();
    const store = fakeStore({ databaseNow: () => gate.promise, sites: ['site-a'] });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    gate.resolve(new Date(NOW + 2 * DAY_MS));
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(sweep.value?.error).toBeInstanceOf(RangeError);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
  });

  it('R6 close() during the clock check: a rejected databaseNow gives error', async () => {
    const gate = deferred<Date>();
    const failure = new Error('clock read failed');
    const store = fakeStore({ databaseNow: () => gate.promise, sites: ['site-a'] });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    gate.reject(failure);
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(sweep.value?.error).toBe(failure);
    expect(store.listSiteIdsWithEventsBefore).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a non-empty listing', sites: ['site-a', 'site-b'] },
    { label: 'an empty listing (overrides R3 (f))', sites: [] as string[] },
  ])('R6 close() during the site listing then $label gives closed, deleted 0, more true', async ({ sites }) => {
    const gate = deferred<string[]>();
    const store = fakeStore({ sites: () => gate.promise, windows: { 'site-a': [{ deleted: 1, remaining: false }] } });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    expect(store.listSiteIdsWithEventsBefore).toHaveBeenCalledTimes(1);
    const closing = track(sweeper.close());
    await flush();
    expect(closing.settled).toBe(false);
    gate.resolve(sites);
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'closed', deleted: 0, more: true });
    expect(store.deleteOldestWindow).not.toHaveBeenCalled();
    expect(logLines()).toEqual([]);
  });

  it('R6 close() during the site listing then a rejected listing gives error', async () => {
    const gate = deferred<string[]>();
    const failure = new Error('listing failed while closing');
    const store = fakeStore({ sites: () => gate.promise });
    const sweeper = sweeperFor(store);
    const sweep = track(sweeper.sweep());
    await flush();
    const closing = track(sweeper.close());
    gate.reject(failure);
    await flush();
    expect(closing).toMatchObject({ settled: true, rejected: false });
    expect(sweep.value).toMatchObject({ status: 'error', deleted: 0, more: true });
    expect(sweep.value?.error).toBe(failure);
    expect(errorLines()).toHaveLength(1);
  });

  it('R6 close() with no sweep in flight resolves, clears the timer, and no later tick sweeps', async () => {
    const store = fakeStore();
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    sweeper.start();
    expect(vi.getTimerCount()).toBe(1);
    await settle(sweeper.close());
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(totalStoreCalls(store)).toBe(0);
  });

  it('R6 sweep() after close() resolves closed, deleted 0, more true without any store call or line', async () => {
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [{ deleted: 1, remaining: false }] } });
    const sweeper = sweeperFor(store);
    await settle(sweeper.close());
    const result = await settle(sweeper.sweep());
    expect(result).toMatchObject({ status: 'closed', deleted: 0, more: true });
    expect(totalStoreCalls(store)).toBe(0);
    expect(logLines()).toEqual([]);
    expect(errorLines()).toEqual([]);
  });

  it('R6 start() after close() is a no-op', async () => {
    const store = fakeStore();
    const sweeper = sweeperFor(store, { intervalMs: 60_000 });
    await settle(sweeper.close());
    sweeper.start();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(totalStoreCalls(store)).toBe(0);
  });

  it('R6 close() is idempotent and never rejects, also when called twice while a window is in flight', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({ sites: ['site-a'], windows: { 'site-a': [() => gate.promise] } });
    const sweeper = sweeperFor(store);
    void sweeper.sweep();
    await flush();
    const first = track(sweeper.close());
    const second = track(sweeper.close());
    gate.resolve({ deleted: 1, remaining: false });
    await flush();
    expect(first).toMatchObject({ settled: true, rejected: false });
    expect(second).toMatchObject({ settled: true, rejected: false });
    const calls = totalStoreCalls(store);
    const third = track(sweeper.close());
    await flush();
    expect(third).toMatchObject({ settled: true, rejected: false });
    expect(totalStoreCalls(store)).toBe(calls);
  });

  it('R6 sweep() while close() waits on a store call adds no store call and resolves closed', async () => {
    const gate = deferred<EventRetentionWindowResult>();
    const store = fakeStore({
      sites: ['site-a', 'site-b'],
      windows: { 'site-a': [() => gate.promise], 'site-b': [{ deleted: 1, remaining: false }] },
    });
    const sweeper = sweeperFor(store);
    const inFlight = track(sweeper.sweep());
    await flush();
    const calls = totalStoreCalls(store);
    const closing = track(sweeper.close());
    const during = track(sweeper.sweep());
    await flush();
    expect(totalStoreCalls(store)).toBe(calls);
    gate.resolve({ deleted: 2, remaining: false });
    await flush();
    expect(closing.settled).toBe(true);
    expect(inFlight.value?.status).toBe('closed');
    expect(during.value?.status).toBe('closed');
    const late = await settle(sweeper.sweep());
    expect(late).toMatchObject({ status: 'closed', deleted: 0, more: true });
    expect(totalStoreCalls(store)).toBe(calls);
  });
});
