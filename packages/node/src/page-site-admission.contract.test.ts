import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import type { QueryPageOptions, QueryPageParams, QueryPageResult, Site } from '@litemetrics/core';

type ClientBoundary = {
  query: Mock<(text: unknown, values?: unknown[]) => Promise<QueryResult>>;
  release: Mock<(destroy?: boolean | Error) => void>;
};
type LeaseBoundary = {
  resolve: (client: ClientBoundary) => void;
  reject: (error: unknown) => void;
};
type PoolBoundary = {
  connect: Mock<() => Promise<ClientBoundary>>;
  query: Mock<(text: unknown, values?: unknown[]) => Promise<QueryResult>>;
  end: Mock<() => Promise<void>>;
};

const driver = vi.hoisted(() => ({
  pools: [] as PoolBoundary[],
  configurations: [] as unknown[],
  leases: [] as LeaseBoundary[],
}));

// PostgreSQL is mocked to control unresolved driver checkout and SQL promises;
// admission, timeout, row mapping, and cleanup remain the real public adapter's work.
vi.mock('pg', () => {
  class Pool {
    constructor(configuration: unknown) {
      driver.configurations.push(configuration);
      driver.pools.push(this);
    }
    connect = vi.fn<() => Promise<ClientBoundary>>(() => new Promise((resolve, reject) => {
      driver.leases.push({ resolve, reject });
    }));
    query = vi.fn<(text: unknown, values?: unknown[]) => Promise<QueryResult>>(async () => ({
      rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
    }));
    end = vi.fn<() => Promise<void>>(async () => {});
  }
  return { Pool, default: { Pool } };
});

const collectorBoundary = vi.hoisted(() => ({
  getSite: vi.fn<(id: string) => Promise<Site | null>>(),
  getSiteBySecret: vi.fn<(secret: string) => Promise<Site | null>>(),
  getSiteForPage: vi.fn<(id: string, deadline?: number) => Promise<Site | null>>(),
  getSiteBySecretForPage: vi.fn<(secret: string, deadline?: number) => Promise<Site | null>>(),
  queryPage: vi.fn<(params: QueryPageParams, options?: QueryPageOptions) => Promise<QueryPageResult>>(),
}));
const collectorFeatures = vi.hoisted(() => ({ pageSiteReads: true }));

// The collector's adapter is mocked to expose HTTP-to-public-API wiring without
// sockets or database work; its real handler still parses, authorizes, and responds.
vi.mock('./adapters/clickhouse', () => ({
  ClickHouseAdapter: class {
    init = async () => {};
    close = async () => {};
    insertEvents = async () => {};
    query = async () => ({});
    queryTimeSeries = async () => ({});
    queryRetention = async () => ({});
    listEvents = async () => ({});
    listUsers = async () => ({});
    getUserDetail = async () => null;
    getUserEvents = async () => ({});
    deleteUserEvents = async () => ({ deleted: 0 });
    queryBotStats = async () => ({ total: 0, bySignature: 0, byHeuristic: 0, byRateLimit: 0, byVelocity: 0 });
    upsertIdentity = async () => {};
    getVisitorIdsForUser = async () => [];
    getUserIdForVisitor = async () => null;
    createSite = async () => ({});
    listSites = async () => [];
    updateSite = async () => null;
    deleteSite = async () => false;
    regenerateSecret = async () => null;
    getSite = collectorBoundary.getSite;
    getSiteBySecret = collectorBoundary.getSiteBySecret;
    getSiteForPage = collectorFeatures.pageSiteReads ? collectorBoundary.getSiteForPage : undefined;
    getSiteBySecretForPage = collectorFeatures.pageSiteReads ? collectorBoundary.getSiteBySecretForPage : undefined;
    queryPage = collectorBoundary.queryPage;
  },
}));

import { PostgresAdapter } from './adapters/postgres';
import { AggregatePageError } from './aggregate-page';
import { createCollector } from './collector';

const START = Date.parse('2026-10-01T09:00:00.000Z');
const DATABASE_URL = 'postgres://contract_reader:synthetic-password@postgres.example.test:5432/analytics_contract';
const SITE: Site = {
  siteId: 'site_codixus_docs', secretKey: 'site_secret_docs_current_20261001',
  name: 'Codixus Documentation', type: 'web', domain: 'docs.codixus.example',
  allowedOrigins: ['https://docs.codixus.example'], conversionEvents: ['newsletter_signup'],
  botFilterMode: 'standard', createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-30T17:15:00.000Z',
};
const PARAMS: QueryPageParams = { siteId: SITE.siteId, metric: 'top_pages', period: '7d', limit: 30 };
const PAGE: QueryPageResult = {
  metric: 'top_pages', measure: 'pageviews', data: [{ key: '/guides/installation', value: 12, share: 1 }],
  limit: 30, rowCount: 1, valueSum: 12, denominatorValue: 12, denominatorKind: 'bucket_sum',
  snapshot: {
    id: 'snapshot_docs_20261001', createdAt: new Date(START).toISOString(),
    expiresAt: new Date(START + 600_000).toISOString(), from: '2026-09-24T09:00:00.000Z',
    to: new Date(START).toISOString(), period: '7d', timezone: 'UTC',
  },
  nextCursor: null, previousCursor: null,
};

function siteRow(site: Site = SITE): QueryResultRow {
  return {
    site_id: site.siteId, secret_key: site.secretKey, name: site.name, type: site.type ?? null,
    domain: site.domain ?? null, allowed_origins: site.allowedOrigins ?? null,
    conversion_events: site.conversionEvents ?? null, bot_filter_mode: site.botFilterMode ?? null,
    created_at: new Date(site.createdAt), updated_at: new Date(site.updatedAt), deleted_at: null,
  };
}
function result(rows: QueryResultRow[] = []): QueryResult {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}
function client(rows: QueryResultRow[] = [siteRow()]): ClientBoundary {
  return {
    query: vi.fn<(text: unknown, values?: unknown[]) => Promise<QueryResult>>(async () => result(rows)),
    release: vi.fn<(destroy?: boolean | Error) => void>(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observed(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
function unavailable(outcome: { ok: boolean; error?: unknown }) {
  expect(outcome.ok).toBe(false);
  expect(outcome.error).toBeInstanceOf(AggregatePageError);
  expect(outcome.error).toMatchObject({ code: 'aggregate_snapshot_unavailable', status: 503 });
}
const flush = () => vi.advanceTimersByTimeAsync(0);
const adapters: PostgresAdapter[] = [];
function adapter() {
  const instance = new PostgresAdapter(DATABASE_URL);
  adapters.push(instance);
  return instance;
}
function pool(): PoolBoundary { return driver.pools[0]!; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.stubEnv('LITEMETRICS_PG_POOL_MAX', '7');
  driver.pools.length = 0;
  driver.configurations.length = 0;
  driver.leases.length = 0;
  collectorFeatures.pageSiteReads = true;
  for (const method of Object.values(collectorBoundary)) method.mockReset();
  collectorBoundary.getSite.mockResolvedValue(SITE);
  collectorBoundary.getSiteBySecret.mockResolvedValue(SITE);
  collectorBoundary.getSiteForPage.mockResolvedValue(SITE);
  collectorBoundary.getSiteBySecretForPage.mockResolvedValue(SITE);
  collectorBoundary.queryPage.mockResolvedValue(PAGE);
});
afterEach(async () => {
  await Promise.all(adapters.splice(0).map((instance) => instance.close()));
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Postgres page-only site admission public contract', () => {
  it.each(['id', 'secret'] as const)('reads a full current Site by %s on an admitted client', async (lookup) => {
    const instance = adapter();
    const operation = lookup === 'id'
      ? instance.getSiteForPage(SITE.siteId)
      : instance.getSiteBySecretForPage(SITE.secretKey);
    await flush();
    expect(driver.configurations).toEqual([{
      connectionString: DATABASE_URL, max: 7, connectionTimeoutMillis: 60_000,
    }]);
    expect(pool().connect).toHaveBeenCalledTimes(1);
    expect(pool().query).not.toHaveBeenCalled();
    const lease = client();
    driver.leases[0]!.resolve(lease);
    expect(await operation).toEqual(SITE);
    expect(lease.query.mock.calls.some(([, values]) => values?.includes(lookup === 'id' ? SITE.siteId : SITE.secretKey))).toBe(true);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(pool().query).not.toHaveBeenCalled();
  });

  it('re-reads rotation, changed site details, and deletion without a site cache', async () => {
    const instance = adapter();
    const read = async (idOrSecret: string, bySecret: boolean, rows: QueryResultRow[]) => {
      const index = driver.leases.length;
      const operation = bySecret ? instance.getSiteBySecretForPage(idOrSecret) : instance.getSiteForPage(idOrSecret);
      await flush();
      expect(driver.leases).toHaveLength(index + 1);
      const lease = client(rows);
      driver.leases[index]!.resolve(lease);
      const value = await operation;
      expect(lease.release).toHaveBeenCalledTimes(1);
      return value;
    };
    expect(await read(SITE.secretKey, true, [siteRow()])).toEqual(SITE);
    const rotated = { ...SITE, secretKey: 'site_secret_docs_rotated_20261001', name: 'Codixus Developer Docs', updatedAt: '2026-10-01T09:00:01.000Z' };
    expect(await read(SITE.secretKey, true, [])).toBeNull();
    expect(await read(rotated.secretKey, true, [siteRow(rotated)])).toEqual(rotated);
    expect(await read(SITE.siteId, false, [siteRow(rotated)])).toEqual(rotated);
    expect(await read(SITE.siteId, false, [])).toBeNull();
    expect(pool().query).not.toHaveBeenCalled();
  });

  it('keeps the legacy site reads usable on pool.query while page checkouts are saturated', async () => {
    const instance = adapter();
    const held = Array.from({ length: 4 }, () => observed(instance.getSiteForPage(SITE.siteId)));
    await flush();
    pool().query.mockResolvedValue(result([siteRow()]));
    expect(await instance.getSite(SITE.siteId)).toEqual(SITE);
    expect(await instance.getSiteBySecret(SITE.secretKey)).toEqual(SITE);
    expect(pool().query).toHaveBeenCalledTimes(2);
    expect(pool().connect).toHaveBeenCalledTimes(4);
    driver.leases.forEach((lease) => lease.resolve(client()));
    expect((await Promise.all(held)).every((outcome) => outcome.ok)).toBe(true);
  });

  it.each(['id', 'secret', 'page'] as const)('rejects an already expired %s deadline before driver admission', async (lookup) => {
    const instance = adapter();
    const operation = lookup === 'page' ? instance.queryPage(PARAMS, { deadline: START })
      : lookup === 'id' ? instance.getSiteForPage(SITE.siteId, START)
        : instance.getSiteBySecretForPage(SITE.secretKey, START);
    unavailable(await observed(operation));
    expect(pool().connect).not.toHaveBeenCalled();
    expect(pool().query).not.toHaveBeenCalled();
  });

  it('shares four unresolved driver checkouts and exactly 128 waiting operations across page APIs', async () => {
    const instance = adapter();
    const active = Array.from({ length: 4 }, (_, index) => observed(index % 2
      ? instance.getSiteBySecretForPage(SITE.secretKey)
      : instance.getSiteForPage(SITE.siteId)));
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(4);
    let settledQueued = 0;
    const queued = Array.from({ length: 128 }, (_, index) => observed(index === 127
      ? instance.queryPage(PARAMS)
      : index % 2 ? instance.getSiteBySecretForPage(SITE.secretKey) : instance.getSiteForPage(SITE.siteId))
      .then((outcome) => { settledQueued++; return outcome; }));
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(4);
    expect(settledQueued).toBe(0);
    unavailable(await observed(instance.getSiteBySecretForPage(SITE.secretKey)));
    await vi.advanceTimersByTimeAsync(60_000);
    (await Promise.all([...active, ...queued])).forEach(unavailable);
    const late = driver.leases.map(() => client());
    driver.leases.forEach((lease, index) => lease.resolve(late[index]!));
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(4);
    expect(pool().query).not.toHaveBeenCalled();
    for (const lease of late) {
      expect(lease.query).not.toHaveBeenCalled();
      expect(lease.release).toHaveBeenCalledTimes(1);
    }
  });

  it('retains timed-out checkout slots until actual late leases settle', async () => {
    const instance = adapter();
    const timedOut = Array.from({ length: 4 }, () => observed(instance.getSiteForPage(SITE.siteId, START + 25)));
    await flush();
    await vi.advanceTimersByTimeAsync(25);
    (await Promise.all(timedOut)).forEach(unavailable);
    const replacements = Array.from({ length: 4 }, () => observed(instance.getSiteBySecretForPage(SITE.secretKey)));
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(4);
    const late = client();
    driver.leases[0]!.resolve(late);
    await flush();
    expect(late.query).not.toHaveBeenCalled();
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(pool().connect).toHaveBeenCalledTimes(5);
    for (let index = 1; index < 4; index++) {
      const lease = client();
      driver.leases[index]!.resolve(lease);
      await flush();
      expect(lease.query).not.toHaveBeenCalled();
      expect(lease.release).toHaveBeenCalledTimes(1);
      expect(pool().connect).toHaveBeenCalledTimes(5 + index);
    }
    driver.leases.slice(4).forEach((lease) => lease.resolve(client()));
    for (const outcome of await Promise.all(replacements)) expect(outcome).toEqual({ ok: true, value: SITE });
  });

  it('expires a queued site read without ever requesting a driver lease', async () => {
    const instance = adapter();
    const active = Array.from({ length: 4 }, () => observed(instance.getSiteForPage(SITE.siteId)));
    await flush();
    const queued = observed(instance.getSiteBySecretForPage(SITE.secretKey, START + 100));
    await vi.advanceTimersByTimeAsync(100);
    unavailable(await queued);
    expect(pool().connect).toHaveBeenCalledTimes(4);
    driver.leases.forEach((lease) => lease.resolve(client()));
    expect((await Promise.all(active)).every((outcome) => outcome.ok)).toBe(true);
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(4);
    expect(pool().query).not.toHaveBeenCalled();
  });

  it('does not renew the original deadline when a queued lookup reaches checkout', async () => {
    const instance = adapter();
    const held = Array.from({ length: 4 }, () => observed(instance.getSiteForPage(SITE.siteId)));
    await flush();
    const queued = observed(instance.getSiteBySecretForPage(SITE.secretKey, START + 100));
    await vi.advanceTimersByTimeAsync(80);
    driver.leases[0]!.resolve(client());
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(20);
    unavailable(await queued);
    const late = client();
    driver.leases[4]!.resolve(late);
    driver.leases.slice(1, 4).forEach((lease) => lease.resolve(client()));
    await Promise.all(held);
    await flush();
    expect(late.query).not.toHaveBeenCalled();
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it('times out an in-flight SQL lookup and cannot turn its late result into success', async () => {
    const instance = adapter();
    const sql = deferred<QueryResult>();
    const lease = client();
    lease.query.mockImplementation(() => sql.promise);
    const operation = observed(instance.getSiteForPage(SITE.siteId, START + 100));
    await flush();
    await vi.advanceTimersByTimeAsync(80);
    driver.leases[0]!.resolve(lease);
    await flush();
    expect(lease.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20);
    unavailable(await operation);
    sql.resolve(result([siteRow()]));
    await flush();
    unavailable(await operation);
    expect(lease.query).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(pool().query).not.toHaveBeenCalled();
  });

  it('allows an optional deadline to shorten, but never extend, the default 60 second budget', async () => {
    const instance = adapter();
    const operation = observed(instance.getSiteBySecretForPage(SITE.secretKey, START + 120_000));
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    unavailable(await operation);
    const late = client();
    driver.leases[0]!.resolve(late);
    await flush();
    expect(late.query).not.toHaveBeenCalled();
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it('releases admission after a rejected driver checkout so a later lookup can succeed', async () => {
    const instance = adapter();
    const failed = observed(instance.getSiteForPage(SITE.siteId));
    await flush();
    driver.leases[0]!.reject(new Error('synthetic checkout unavailable'));
    unavailable(await failed);
    const next = instance.getSiteBySecretForPage(SITE.secretKey);
    await flush();
    expect(pool().connect).toHaveBeenCalledTimes(2);
    const lease = client();
    driver.leases[1]!.resolve(lease);
    expect(await next).toEqual(SITE);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});

type ResponseBoundary = {
  statusCode: number; body: unknown;
  setHeader: (name: string, value: unknown) => void;
  writeHead: (status: number, headers?: unknown) => void;
  end: (body?: string) => void;
  status: (status: number) => ResponseBoundary;
  json: (body: unknown) => void;
};
function response(): ResponseBoundary {
  const res: ResponseBoundary = {
    statusCode: 0, body: undefined, setHeader: () => {},
    writeHead: (status) => { res.statusCode = status; },
    end: (body) => { if (body) res.body = JSON.parse(body); },
    status: (status) => { res.statusCode = status; return res; },
    json: (body) => { res.body = body; },
  };
  return res;
}
function request(headers: Record<string, string> = { 'x-litemetrics-secret': SITE.secretKey }, extra = '') {
  return { method: 'GET', headers, url: `/api/stats/page?siteId=${SITE.siteId}&metric=top_pages&period=7d&limit=30${extra}` };
}
function collector(adminSecret?: string) {
  return createCollector({ db: { adapter: 'clickhouse', url: 'http://clickhouse.example.test:8123' }, geoip: false, adminSecret });
}

describe('collector page admission deadline public wiring', () => {
  it('captures a deadline before site authorization and passes the same value after authorization delay', async () => {
    const instance = await collector();
    const authorization = deferred<Site | null>();
    collectorBoundary.getSiteBySecretForPage.mockImplementation(() => authorization.promise);
    const res = response();
    const operation = instance.queryPageHandler()(request(), res);
    await flush();
    expect(collectorBoundary.getSiteBySecretForPage).toHaveBeenCalledWith(SITE.secretKey, START + 60_000);
    await vi.advanceTimersByTimeAsync(4_000);
    authorization.resolve(SITE);
    await operation;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(PAGE);
    expect(collectorBoundary.queryPage).toHaveBeenCalledTimes(1);
    expect(collectorBoundary.queryPage.mock.calls[0]![0]).toMatchObject(PARAMS);
    expect(collectorBoundary.queryPage.mock.calls[0]![1]).toEqual({ deadline: START + 60_000 });
    expect(collectorBoundary.getSiteBySecret).not.toHaveBeenCalled();
  });

  it('preserves admin precedence even when an invalid site secret is also supplied', async () => {
    const instance = await collector('admin_secret_contract_20261001');
    collectorBoundary.getSiteBySecretForPage.mockRejectedValue(new AggregatePageError('aggregate_snapshot_unavailable', 503));
    const res = response();
    await instance.queryPageHandler()(request({
      'x-litemetrics-admin-secret': 'admin_secret_contract_20261001',
      'x-litemetrics-secret': 'revoked_site_secret_20260930',
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(PAGE);
    expect(collectorBoundary.getSiteBySecretForPage).not.toHaveBeenCalled();
    expect(collectorBoundary.getSiteBySecret).not.toHaveBeenCalled();
    expect(collectorBoundary.queryPage.mock.calls[0]![1]).toEqual({ deadline: START + 60_000 });
  });

  it('supports an adapter without page-only site lookup while retaining the request deadline', async () => {
    collectorFeatures.pageSiteReads = false;
    const instance = await collector();
    const res = response();
    await instance.queryPageHandler()(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(PAGE);
    expect(collectorBoundary.getSiteBySecret).toHaveBeenCalledWith(SITE.secretKey);
    expect(collectorBoundary.getSiteBySecretForPage).not.toHaveBeenCalled();
    expect(collectorBoundary.queryPage.mock.calls[0]![1]).toEqual({ deadline: START + 60_000 });
  });

  it('returns the named 503 when page authorization lookup throws AggregatePageError', async () => {
    const instance = await collector();
    collectorBoundary.getSiteBySecretForPage.mockRejectedValue(new AggregatePageError('aggregate_snapshot_unavailable', 503));
    const res = response();
    await instance.queryPageHandler()(request(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'aggregate_snapshot_unavailable' });
    expect(JSON.stringify(res.body)).not.toContain(SITE.secretKey);
    expect(collectorBoundary.queryPage).not.toHaveBeenCalled();
  });

  it('rejects a current site secret belonging to a different site before paging', async () => {
    const instance = await collector();
    collectorBoundary.getSiteBySecretForPage.mockResolvedValue({ ...SITE, siteId: 'site_partner_portal' });
    const res = response();
    await instance.queryPageHandler()(request(), res);
    expect(res.statusCode).toBe(401);
    expect(collectorBoundary.queryPage).not.toHaveBeenCalled();
    expect(collectorBoundary.getSiteBySecret).not.toHaveBeenCalled();
  });

  it('re-authorizes each page request after secret rotation and site deletion', async () => {
    const instance = await collector();
    let current: Site | null = SITE;
    collectorBoundary.getSiteBySecretForPage.mockImplementation(async (secret) => current?.secretKey === secret ? current : null);
    const handler = instance.queryPageHandler();
    const first = response();
    await handler(request(), first);
    expect(first.statusCode).toBe(200);
    current = { ...SITE, secretKey: 'site_secret_docs_rotated_20261001' };
    const revoked = response();
    await handler(request(), revoked);
    expect(revoked.statusCode).toBe(401);
    const rotated = response();
    await handler(request({ 'x-litemetrics-secret': current.secretKey }), rotated);
    expect(rotated.statusCode).toBe(200);
    const rotatedSecret = current.secretKey;
    current = null;
    const deleted = response();
    await handler(request({ 'x-litemetrics-secret': rotatedSecret }), deleted);
    expect(deleted.statusCode).toBe(401);
    expect(collectorBoundary.getSiteBySecretForPage).toHaveBeenCalledTimes(4);
    expect(collectorBoundary.queryPage).toHaveBeenCalledTimes(2);
    expect(collectorBoundary.getSiteBySecret).not.toHaveBeenCalled();
  });

  it('rejects deadline as an unknown HTTP filter rather than letting callers choose an internal budget', async () => {
    const instance = await collector();
    const res = response();
    await instance.queryPageHandler()(request(undefined, `&deadline=${START + 600_000}`), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_filter' });
    expect(collectorBoundary.queryPage).not.toHaveBeenCalled();
  });

  it('forwards an explicit programmatic QueryPageOptions deadline without resetting it', async () => {
    const instance = await collector();
    const options: QueryPageOptions = { deadline: START + 12_345 };
    expect(await instance.queryPage(PARAMS, options)).toEqual(PAGE);
    expect(collectorBoundary.queryPage).toHaveBeenCalledWith(expect.objectContaining(PARAMS), options);
  });

  it('keeps getStatsPageHandler as the public page-handler alias with the same admission budget', async () => {
    const instance = await collector();
    const res = response();
    await instance.getStatsPageHandler()(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(PAGE);
    expect(collectorBoundary.getSiteBySecretForPage).toHaveBeenCalledWith(SITE.secretKey, START + 60_000);
    expect(collectorBoundary.queryPage.mock.calls[0]![1]).toEqual({ deadline: START + 60_000 });
  });
});
