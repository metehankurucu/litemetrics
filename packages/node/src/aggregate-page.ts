import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { FILTER_KEY_IDS } from '@litemetrics/core';
import type { Period, QueryPageMetric, QueryPageParams, QueryPageResult, Site } from '@litemetrics/core';
import { normalizeReferrer } from './normalize-referrer.js';

export class AggregatePageError extends Error {
  retryAfterMs?: number;
  constructor(public code: string, public status: number, public field?: string) {
    super(code);
    this.name = 'AggregatePageError';
    if (code === 'snapshot_capacity') this.retryAfterMs = 5000;
  }
}

export const SNAPSHOT_TTL = 600_000;
export const SNAPSHOT_BUILD_TIMEOUT = 60_000;
export const SNAPSHOT_ROW_CAP = 1_000_000;
export const SNAPSHOT_QUOTA = 32;
const METRICS: QueryPageMetric[] = ['top_pages', 'top_referrers', 'top_countries', 'top_os', 'top_app_versions', 'top_devices'];
const PERIODS: Period[] = ['1h', '24h', '7d', '30d', '90d', 'custom'];
const PARAMS = new Set(['siteId', 'metric', 'period', 'dateFrom', 'dateTo', 'timezone', 'filters', 'includeBots', 'search', 'keys', 'minCount', 'limit', 'cursor', 'snapshot']);

export const FILTER_COLUMNS: Record<string, string> = {
  'geo.country': 'country', 'geo.region': 'region', 'geo.city': 'city', language: 'language',
  'device.type': 'device_type', 'device.browser': 'browser', 'device.os': 'os',
  'device.osVersion': 'os_version', 'device.deviceModel': 'device_model',
  'device.deviceBrand': 'device_brand', 'device.appVersion': 'app_version',
  'utm.source': 'utm_source', 'utm.medium': 'utm_medium', 'utm.campaign': 'utm_campaign',
  'utm.term': 'utm_term', 'utm.content': 'utm_content', referrer: 'referrer',
  event_source: 'event_source', event_subtype: 'event_subtype', event_name: 'event_name',
  page_path: 'page_path', target_url_path: 'target_url_path', type: 'type',
};
export const METRIC_COLUMNS: Record<QueryPageMetric, string> = {
  top_pages: 'url', top_referrers: 'referrer', top_countries: 'country',
  top_devices: 'device_type', top_os: 'os', top_app_versions: 'app_version',
};
export const asciiFold = (value: string): string => value.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
export const byteCompare = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

function invalid(field: string): never { throw new AggregatePageError('invalid_filter', 400, field); }
function string(value: unknown, field: string, max = 8192): string {
  if (typeof value !== 'string' || [...value].length > max || /[\u0000-\u001f\u007f]/.test(value) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value)) invalid(field);
  return value;
}
function instant(value: unknown, field: string): string {
  const text = string(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new AggregatePageError('invalid_date', 400, field);
  const time = Date.parse(text);
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const days = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  if (!Number.isFinite(time) || month! < 1 || month! > 12 || day! < 1 || day! > days || +text.slice(11, 13) > 23 || +text.slice(14, 16) > 59 || +text.slice(17, 19) > 59) throw new AggregatePageError('invalid_date', 400, field);
  return new Date(time).toISOString();
}

export interface NormalizedPageParams extends QueryPageParams {
  period: Period; timezone: string; filters: Record<string, string>;
  includeBots: boolean; search: string; minCount: number; limit: number;
}

export function normalizePageParams(input: QueryPageParams): NormalizedPageParams {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('query');
  for (const key of Object.keys(input)) if (!PARAMS.has(key)) invalid(key);
  const siteId = string(input.siteId, 'siteId', 256);
  if (!siteId) invalid('siteId');
  if (typeof input.metric !== 'string' || !input.metric) invalid('metric');
  if (!METRICS.includes(input.metric)) throw new AggregatePageError('unknown_metric', 404, 'metric');
  const period = input.period ?? '7d';
  if (!PERIODS.includes(period)) invalid('period');
  let dateFrom: string | undefined, dateTo: string | undefined;
  if (period === 'custom') {
    if (input.dateFrom === undefined || input.dateTo === undefined) throw new AggregatePageError('invalid_date', 400);
    dateFrom = instant(input.dateFrom, 'dateFrom'); dateTo = instant(input.dateTo, 'dateTo');
    if (Date.parse(dateFrom) >= Date.parse(dateTo)) throw new AggregatePageError('invalid_date', 400);
  } else if (input.dateFrom !== undefined || input.dateTo !== undefined) throw new AggregatePageError('invalid_date', 400);
  const timezone = string(input.timezone ?? 'UTC', 'timezone', 128);
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { invalid('timezone'); }
  const limit = input.limit ?? 30, minCount = input.minCount ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalid('limit');
  if (!Number.isSafeInteger(minCount) || minCount < 0) invalid('minCount');
  if (input.includeBots !== undefined && typeof input.includeBots !== 'boolean') invalid('includeBots');
  const search = asciiFold(string(input.search ?? '', 'search').trim());
  if ([...search].length > 100) invalid('search');
  const filters: Record<string, string> = {};
  if (input.filters !== undefined) {
    if (!input.filters || typeof input.filters !== 'object' || Array.isArray(input.filters)) invalid('filters');
    for (const key of Object.keys(input.filters).sort(byteCompare)) {
      if (!(FILTER_KEY_IDS as readonly string[]).includes(key)) invalid('filters');
      const value = string(input.filters[key], 'filters');
      filters[key] = key === 'referrer' ? normalizeReferrer(value) ?? asciiFold(value) : value;
    }
  }
  let keys: string[] | undefined;
  if (input.keys !== undefined) {
    if (!Array.isArray(input.keys) || input.keys.length > 250) invalid('keys');
    keys = input.keys.map((key) => string(key, 'keys')).sort(byteCompare);
    if (new Set(keys).size !== keys.length) invalid('keys');
  }
  const cursor = input.cursor === undefined ? undefined : string(input.cursor, 'cursor', 16384);
  if (cursor === '') throw new AggregatePageError('invalid_cursor', 400);
  const snapshot = input.snapshot === undefined ? undefined : string(input.snapshot, 'snapshot', 128);
  // Snapshot identifiers are opaque. A well-formed but absent identifier is
  // resolved after current site authorization and receives snapshot_expired.
  if (snapshot === '') throw new AggregatePageError('invalid_cursor', 400, 'snapshot');
  return { siteId, metric: input.metric, period, dateFrom, dateTo, timezone, filters, includeBots: input.includeBots ?? false, search, keys, minCount, limit, cursor, snapshot };
}

/** Reject duplicates before Express can collapse/reshape them. */
export function extractPageParams(req: { url?: string; query?: Record<string, unknown> }): QueryPageParams {
  const raw: Record<string, unknown> = {};
  const url = new URL(req.url ?? '/', 'http://localhost');
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1) invalid(key);
    raw[key] = url.searchParams.get(key);
  }
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (typeof value !== 'string') invalid(key);
    if (raw[key] !== undefined && raw[key] !== value) invalid(key);
    raw[key] = value;
  }
  for (const key of Object.keys(raw)) if (!PARAMS.has(key)) invalid(key);
  for (const key of ['filters', 'keys']) if (raw[key] !== undefined) {
    try { raw[key] = JSON.parse(raw[key] as string); } catch { invalid(key); }
  }
  for (const key of ['limit', 'minCount']) if (raw[key] !== undefined) {
    if (!/^\d+$/.test(raw[key] as string)) invalid(key);
    raw[key] = Number(raw[key]);
  }
  if (raw.includeBots !== undefined) {
    if (!['true', 'false', '1', '0'].includes(raw.includeBots as string)) invalid('includeBots');
    raw.includeBots = raw.includeBots === 'true' || raw.includeBots === '1';
  }
  return normalizePageParams(raw as unknown as QueryPageParams);
}

export function pageScopeHash(q: NormalizedPageParams): string {
  const { cursor: _cursor, snapshot: _snapshot, ...scope } = q;
  return createHash('sha256').update(JSON.stringify({ version: 1, sort: 'valueDESC,keyUTF8ASC', ...scope })).digest('hex');
}

export interface AggregateSnapshot {
  id: string; siteId: string; scopeHash: string; metric: QueryPageMetric;
  state: 'building' | 'ready' | 'failed'; limit: number;
  createdAt: string; expiresAt: string; from: string; to: string; period: Period; timezone: string;
  rowCount: number; valueSum: number;
}
export interface AggregateRow { position: number; key: string; value: number }
export interface AggregateBackend {
  ensure(): Promise<void>;
  reserve(snapshot: AggregateSnapshot): Promise<{ snapshot: AggregateSnapshot; owned: boolean }>;
  materialize(snapshot: AggregateSnapshot, q: NormalizedPageParams): Promise<{ rowCount: number; valueSum: number }>;
  publish(snapshot: AggregateSnapshot): Promise<void>;
  fail(snapshot: AggregateSnapshot): Promise<void>;
  get(id: string, siteId: string, deadline?: number): Promise<AggregateSnapshot | null>;
  rows(id: string, boundary: number, direction: 'forward' | 'back', limit: number): Promise<AggregateRow[]>;
  cleanup(now: number, siteId: string): Promise<void>;
}
export function safeCount(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'bigint' && !(typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value))) throw unavailable();
  const count = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(count) || count < 0) throw new AggregatePageError('aggregate_snapshot_unavailable', 503);
  return count;
}
export function capacity(): AggregatePageError { return new AggregatePageError('snapshot_capacity', 429); }
export function unavailable(): AggregatePageError { return new AggregatePageError('aggregate_snapshot_unavailable', 503); }

interface Cursor { v: 1; id: string; hash: string; exp: number; boundary: number; direction: 'forward' | 'back' }
function signCursor(cursor: Cursor, secret: string): string {
  const body = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function readCursor(token: string, secret: string): Cursor {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const expected = createHmac('sha256', secret).update(parts[0]!).digest();
    const actual = Buffer.from(parts[1]!, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const cursor = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as Cursor;
    if (cursor.v !== 1 || typeof cursor.id !== 'string' || !/^[a-f\d-]{36}$/i.test(cursor.id) || !/^[a-f\d]{64}$/.test(cursor.hash) || !Number.isSafeInteger(cursor.exp) || !Number.isSafeInteger(cursor.boundary) || cursor.boundary < 1 || !['forward', 'back'].includes(cursor.direction)) throw new Error();
    return cursor;
  } catch { throw new AggregatePageError('invalid_cursor', 400); }
}

export class AggregatePager {
  private inflight = new Map<string, Promise<AggregateSnapshot>>();
  private constructions = 0;
  constructor(private backend: AggregateBackend, private getSite: (id: string) => Promise<Site | null>) {}

  private async create(q: NormalizedPageParams, scopeHash: string): Promise<AggregateSnapshot> {
    const existing = this.inflight.get(scopeHash);
    if (existing) return existing;
    if (this.constructions >= 2) throw capacity();
    this.constructions++;
    const task = (async () => {
      const now = Date.now();
      const duration: Record<string, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000, '90d': 7_776_000_000 };
      let snapshot: AggregateSnapshot = {
        id: randomUUID(), siteId: q.siteId, scopeHash, metric: q.metric, state: 'building', limit: q.limit,
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SNAPSHOT_TTL).toISOString(),
        from: q.dateFrom ?? new Date(now - duration[q.period]!).toISOString(), to: q.dateTo ?? new Date(now).toISOString(),
        period: q.period, timezone: q.timezone, rowCount: 0, valueSum: 0,
      };
      await this.backend.cleanup(now, q.siteId);
      const reservation = await this.backend.reserve(snapshot);
      snapshot = reservation.snapshot;
      if (!reservation.owned) {
        const deadline = Math.min(now + SNAPSHOT_BUILD_TIMEOUT,
          Date.parse(snapshot.createdAt) + SNAPSHOT_BUILD_TIMEOUT, Date.parse(snapshot.expiresAt));
        while (Date.now() < deadline) {
          const current = await this.backend.get(snapshot.id, q.siteId, deadline);
          if (!current || current.state === 'failed') throw unavailable();
          if (current.state === 'ready') return current;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw unavailable();
      }
      try {
        const totals = await this.backend.materialize(snapshot, q);
        if (Date.now() >= Date.parse(snapshot.createdAt) + SNAPSHOT_BUILD_TIMEOUT) throw unavailable();
        snapshot.rowCount = safeCount(totals.rowCount); snapshot.valueSum = safeCount(totals.valueSum);
        if (snapshot.rowCount > SNAPSHOT_ROW_CAP) throw capacity();
        if (Date.now() >= Date.parse(snapshot.expiresAt)) throw new AggregatePageError('snapshot_expired', 409);
        snapshot.state = 'ready';
        await this.backend.publish(snapshot);
        return snapshot;
      } catch (error) {
        await this.backend.fail(snapshot).catch(() => {});
        throw error;
      }
    })();
    this.inflight.set(scopeHash, task);
    try { return await task; } finally { this.inflight.delete(scopeHash); this.constructions--; }
  }

  async page(input: QueryPageParams): Promise<QueryPageResult> {
    try { return await this.readPage(input); }
    catch (error) {
      if (error instanceof AggregatePageError) throw error;
      const provider = error as { code?: unknown; name?: string };
      if (typeof provider.code === 'string' && /^(?:[0-9A-Z]{5}|ECONN\w*|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EPIPE)$/.test(provider.code) ||
        provider.name?.startsWith('Mongo') || provider.name === 'ClickHouseError') throw unavailable();
      throw new AggregatePageError('internal', 500);
    }
  }

  private async readPage(input: QueryPageParams): Promise<QueryPageResult> {
    const q = normalizePageParams(input);
    const site = await this.getSite(q.siteId);
    if (!site) throw new AggregatePageError('site_not_found', 404);
    if (!site.secretKey) throw unavailable();
    const scopeHash = pageScopeHash(q);
    const cursor = q.cursor ? readCursor(q.cursor, site.secretKey) : null;
    if (cursor && cursor.hash !== scopeHash) throw new AggregatePageError('cursor_query_mismatch', 400);
    if (cursor && q.snapshot && cursor.id !== q.snapshot) throw new AggregatePageError('invalid_cursor', 400, 'snapshot');
    if (cursor && cursor.exp <= Date.now()) throw new AggregatePageError('snapshot_expired', 409);
    await this.backend.ensure();
    const id = cursor?.id ?? q.snapshot;
    const snapshot = id ? await this.backend.get(id, q.siteId) : await this.create(q, scopeHash);
    if (!snapshot || snapshot.state !== 'ready' || Date.parse(snapshot.expiresAt) <= Date.now()) throw new AggregatePageError('snapshot_expired', 409);
    if (![snapshot.createdAt, snapshot.expiresAt, snapshot.from, snapshot.to].every((date) => typeof date === 'string' && Number.isFinite(Date.parse(date))) ||
      Date.parse(snapshot.expiresAt) !== Date.parse(snapshot.createdAt) + SNAPSHOT_TTL || Date.parse(snapshot.from) >= Date.parse(snapshot.to) ||
      !PERIODS.includes(snapshot.period) || typeof snapshot.timezone !== 'string') throw unavailable();
    if (snapshot.siteId !== q.siteId || snapshot.metric !== q.metric || snapshot.scopeHash !== scopeHash || snapshot.limit !== q.limit) throw new AggregatePageError('cursor_query_mismatch', 400);
    if (cursor && cursor.exp !== Date.parse(snapshot.expiresAt)) throw new AggregatePageError('invalid_cursor', 400);
    const rowCount = safeCount(snapshot.rowCount), valueSum = safeCount(snapshot.valueSum);
    if (cursor && cursor.boundary > rowCount) throw new AggregatePageError('invalid_cursor', 400);
    const direction = cursor?.direction ?? 'forward';
    let rows = await this.backend.rows(snapshot.id, cursor?.boundary ?? 0, direction, q.limit + 1);
    if (rows.length > q.limit + 1) throw unavailable();
    rows = rows.slice(0, q.limit);
    if (direction === 'back') rows.reverse();
    for (const row of rows) {
      safeCount(row.value); safeCount(row.position);
      if (typeof row.key !== 'string' || row.position < 1 || row.position > rowCount || row.value > valueSum) throw unavailable();
    }
    if (Date.parse(snapshot.expiresAt) <= Date.now()) throw new AggregatePageError('snapshot_expired', 409);
    const expectedStart = direction === 'back' ? Math.max(1, (cursor?.boundary ?? 1) - q.limit) : (cursor?.boundary ?? 0) + 1;
    const expectedEnd = direction === 'back' ? (cursor?.boundary ?? 1) - 1 : Math.min(rowCount, (cursor?.boundary ?? 0) + q.limit);
    if (rows.length !== Math.max(0, expectedEnd - expectedStart + 1) || rows.some((row, i) => row.position !== expectedStart + i)) throw new AggregatePageError('snapshot_expired', 409);
    const { id: snapshotId, createdAt, expiresAt, from, to, period, timezone } = snapshot;
    const token = (boundary: number, dir: Cursor['direction']) => signCursor({ v: 1, id: snapshotId, hash: scopeHash, exp: Date.parse(expiresAt), boundary, direction: dir }, site.secretKey);
    const first = rows[0], last = rows.at(-1);
    return {
      metric: q.metric, measure: q.metric === 'top_pages' || q.metric === 'top_referrers' ? 'pageviews' : 'visitors',
      data: rows.map(({ key, value }) => ({ key, value, share: valueSum === 0 ? 0 : value / valueSum })), limit: q.limit,
      rowCount, valueSum, denominatorValue: valueSum, denominatorKind: 'bucket_sum',
      snapshot: { id: snapshotId, createdAt, expiresAt, from, to, period, timezone },
      nextCursor: last && last.position < rowCount ? token(last.position, 'forward') : null,
      previousCursor: first && first.position > 1 ? token(first.position, 'back') : null,
    };
  }
}
