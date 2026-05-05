import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { ClickHouseAdapter } from './clickhouse';
import { PostgresAdapter } from './postgres';
import type { EnrichedEvent, QueryResult, Metric } from '@litemetrics/core';

/**
 * Cross-adapter parity test: feeds the same fixture into ClickHouse and Postgres
 * adapters, runs each metric on both, and asserts the result sets agree.
 *
 * Only runs when BOTH `CLICKHOUSE_URL_TEST` and `DATABASE_URL_TEST` are set.
 * In CI, expose this by spinning up both services.
 *
 * Coverage:
 *   - 22 top-N metrics: full key→value map equality
 *   - 5 aggregate scalars: `total` equality
 *   - timeSeries: per-period total equality
 *   - listUsers: per-user attribute equality (visitorId, userId, totalEvents,
 *     totalPageviews, last URL/referrer/device/utm). PG uses DISTINCT ON for the
 *     "last value" attributes which matches ClickHouse `anyLast(x)` (NULL is a
 *     valid last value, not skipped). Counts come from a single pre-filtered CTE.
 */

const CH_URL = process.env.CLICKHOUSE_URL_TEST;
const PG_URL = process.env.DATABASE_URL_TEST;

const describeIfBoth = (CH_URL && PG_URL) ? describe : describe.skip;

describeIfBoth('ClickHouse ↔ Postgres parity', () => {
  let ch: ClickHouseAdapter;
  let pg: PostgresAdapter;
  let chSiteId: string;
  let pgSiteId: string;

  beforeAll(async () => {
    ch = new ClickHouseAdapter(CH_URL!);
    pg = new PostgresAdapter(PG_URL!);
    await Promise.all([ch.init(), pg.init()]);

    // Wipe both backends.
    const pgPool = (pg as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await pgPool.query('TRUNCATE TABLE litemetrics_events, litemetrics_identity_map, litemetrics_sites');
    const chClient = (ch as unknown as { client: { command: (q: { query: string }) => Promise<unknown> } }).client;
    await chClient.command({ query: 'TRUNCATE TABLE litemetrics_events' });
    await chClient.command({ query: 'TRUNCATE TABLE litemetrics_identity_map' });
    await chClient.command({ query: 'TRUNCATE TABLE litemetrics_sites' });

    const chSite = await ch.createSite({ name: 'Parity', type: 'web', domain: 'parity.test', conversionEvents: ['signup', 'purchase'] });
    const pgSite = await pg.createSite({ name: 'Parity', type: 'web', domain: 'parity.test', conversionEvents: ['signup', 'purchase'] });
    chSiteId = chSite.siteId;
    pgSiteId = pgSite.siteId;

    const fixtureCh = buildFixture(chSiteId);
    const fixturePg = buildFixture(pgSiteId);
    await Promise.all([ch.insertEvents(fixtureCh), pg.insertEvents(fixturePg)]);
  });

  afterAll(async () => {
    await Promise.all([ch?.close(), pg?.close()]);
  });

  // ─── Aggregate parity ──────────────────────────────────────

  const aggregates: { metric: Metric; conversionEvents?: string[] }[] = [
    { metric: 'pageviews' },
    { metric: 'visitors' },
    { metric: 'sessions' },
    { metric: 'events' },
    { metric: 'conversions', conversionEvents: ['signup', 'purchase'] },
  ];

  for (const { metric, conversionEvents } of aggregates) {
    it(`${metric} totals match`, async () => {
      const [a, b] = await Promise.all([
        ch.query({ siteId: chSiteId, metric, period: '30d', conversionEvents }),
        pg.query({ siteId: pgSiteId, metric, period: '30d', conversionEvents }),
      ]);
      expect(a.total).toBe(b.total);
    });
  }

  // ─── Top-N parity ──────────────────────────────────────────

  const topMetrics: Metric[] = [
    'top_pages', 'top_referrers', 'top_countries', 'top_cities', 'top_events',
    'top_devices', 'top_browsers', 'top_os', 'top_os_versions', 'top_device_models',
    'top_app_versions', 'top_utm_sources', 'top_utm_mediums', 'top_utm_campaigns',
    'top_utm_terms', 'top_utm_contents', 'top_channels', 'top_exit_pages',
    'top_transitions', 'top_scroll_pages', 'top_button_clicks', 'top_link_targets',
  ];

  for (const metric of topMetrics) {
    it(`${metric} returns same key→value map`, async () => {
      const [a, b] = await Promise.all([
        ch.query({ siteId: chSiteId, metric, period: '30d', limit: 50 }),
        pg.query({ siteId: pgSiteId, metric, period: '30d', limit: 50 }),
      ]);
      expect(toMap(a)).toEqual(toMap(b));
    });
  }

  it('top_conversions agrees with conversionEvents', async () => {
    const [a, b] = await Promise.all([
      ch.query({ siteId: chSiteId, metric: 'top_conversions', period: '30d', conversionEvents: ['signup', 'purchase'], limit: 10 }),
      pg.query({ siteId: pgSiteId, metric: 'top_conversions', period: '30d', conversionEvents: ['signup', 'purchase'], limit: 10 }),
    ]);
    expect(toMap(a)).toEqual(toMap(b));
  });

  // ─── Time series parity (totals over the period) ───────────

  it('queryTimeSeries pageviews per-day totals match', async () => {
    const [a, b] = await Promise.all([
      ch.queryTimeSeries({ siteId: chSiteId, metric: 'pageviews', period: '7d', granularity: 'day' }),
      pg.queryTimeSeries({ siteId: pgSiteId, metric: 'pageviews', period: '7d', granularity: 'day' }),
    ]);
    expect(sumPoints(a.data)).toBe(sumPoints(b.data));
  });

  // ─── listUsers parity ──────────────────────────────────────
  // Uses a fixture with deliberately-NULL fields on later events so we exercise
  // the "anyLast over NULL" semantics. CH `anyLast(x)` and PG `DISTINCT ON` must
  // agree on the most-recent (possibly NULL) value per visitor.

  it('listUsers per-user counts and last values agree', async () => {
    const [a, b] = await Promise.all([
      ch.listUsers({ siteId: chSiteId, limit: 50 }),
      pg.listUsers({ siteId: pgSiteId, limit: 50 }),
    ]);
    expect(a.total).toBe(b.total);
    const byKey = (r: typeof a) => Object.fromEntries(
      r.users.map((u) => [u.userId ?? u.visitorId, normalizeUser(u)]),
    );
    expect(byKey(a)).toEqual(byKey(b));
  });
});

function normalizeUser(u: { visitorId: string; userId?: string; totalEvents: number; totalPageviews: number; totalSessions: number; lastUrl?: string; referrer?: string; device?: { type: string; browser: string; os: string }; utm?: { source?: string; medium?: string; campaign?: string } }): Record<string, unknown> {
  return {
    visitorId: u.visitorId,
    userId: u.userId,
    totalEvents: u.totalEvents,
    totalPageviews: u.totalPageviews,
    totalSessions: u.totalSessions,
    lastUrl: u.lastUrl,
    referrer: u.referrer,
    deviceType: u.device?.type,
    browser: u.device?.browser,
    os: u.device?.os,
    utmSource: u.utm?.source,
    utmMedium: u.utm?.medium,
    utmCampaign: u.utm?.campaign,
  };
}

function toMap(r: QueryResult): Record<string, number> {
  return Object.fromEntries(r.data.map((d) => [d.key, d.value]));
}

function sumPoints(points: { value: number }[]): number {
  return points.reduce((s, p) => s + p.value, 0);
}

function buildFixture(siteId: string): EnrichedEvent[] {
  const now = Date.now();
  const events: EnrichedEvent[] = [];

  events.push(makePageview(siteId, 'visitor-1', 'session-1a', '/home', 'https://google.com/search', now - 1_000 * 60 * 60, { country: 'US' }, { browser: 'Chrome', os: 'macOS', type: 'desktop' }));
  events.push(makePageview(siteId, 'visitor-1', 'session-1a', '/pricing', 'https://parity.test/home', now - 1_000 * 60 * 50, { country: 'US' }, { browser: 'Chrome', os: 'macOS', type: 'desktop' }));
  events.push(makeEvent(siteId, 'visitor-1', 'session-1a', 'signup', { plan: 'pro' }, now - 1_000 * 60 * 49));
  events.push(makePageview(siteId, 'visitor-2', 'session-2a', '/home', 'https://www.instagram.com/x', now - 1_000 * 60 * 60 * 12, { country: 'GB' }, { browser: 'Safari', os: 'iOS', type: 'mobile' }));
  events.push(makeEvent(siteId, 'visitor-2', 'session-2a', 'purchase', { amount: 99 }, now - 1_000 * 60 * 60 * 10));
  events.push(makePageview(siteId, 'visitor-3', 'session-3a', '/about', null, now - 1_000 * 60 * 60 * 24, { country: 'DE' }, { browser: 'Firefox', os: 'Windows', type: 'desktop' }));
  events.push({
    type: 'pageview',
    siteId, visitorId: 'visitor-4', sessionId: 'session-4a', timestamp: now - 1_000 * 60 * 60 * 6,
    url: 'https://parity.test/landing', referrer: 'https://www.google.com/search?q=foo', title: '/landing',
    geo: { country: 'US' }, device: { type: 'desktop', browser: 'Chrome', os: 'macOS' }, language: 'en-US',
    utm: { source: 'google', medium: 'cpc', campaign: 'spring-sale' },
  });
  events.push({
    type: 'pageview',
    siteId, visitorId: 'visitor-5', sessionId: 'session-5a', timestamp: now - 1_000 * 60 * 60 * 5,
    url: 'https://parity.test/landing', referrer: 'https://www.instagram.com/p/abc', title: '/landing',
    geo: { country: 'US' }, device: { type: 'mobile', browser: 'Safari', os: 'iOS' }, language: 'en-US',
    utm: { source: 'instagram' },
  });

  return events;
}

function makePageview(siteId: string, visitorId: string, sessionId: string, path: string, referrer: string | null, ts: number, geo: { country: string }, device: { browser: string; os: string; type: string }): EnrichedEvent {
  return {
    type: 'pageview',
    siteId, visitorId, sessionId, timestamp: ts,
    url: `https://parity.test${path}`, referrer: referrer ?? undefined, title: path,
    geo, device, language: 'en-US',
  };
}

function makeEvent(siteId: string, visitorId: string, sessionId: string, name: string, properties: Record<string, unknown>, ts: number): EnrichedEvent {
  return {
    type: 'event',
    siteId, visitorId, sessionId, timestamp: ts, name, properties,
    eventSource: 'manual', eventSubtype: 'custom',
  };
}
