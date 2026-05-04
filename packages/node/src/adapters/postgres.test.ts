import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PostgresAdapter } from './postgres';
import type { EnrichedEvent } from '@litemetrics/core';

const TEST_URL = process.env.DATABASE_URL_TEST;

const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb('PostgresAdapter integration', () => {
  let adapter: PostgresAdapter;
  let siteId: string;

  beforeAll(async () => {
    adapter = new PostgresAdapter(TEST_URL!);
    await adapter.init();

    // Wipe tables for a clean run (no production data assumed in test DB)
    const pool = (adapter as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await pool.query('TRUNCATE TABLE litemetrics_events, litemetrics_identity_map, litemetrics_sites');

    const site = await adapter.createSite({
      name: 'Parity Test Site',
      type: 'web',
      domain: 'test.example.com',
      conversionEvents: ['signup', 'purchase'],
    });
    siteId = site.siteId;

    await adapter.insertEvents(buildFixtureEvents(siteId));
    await adapter.upsertIdentity(siteId, 'visitor-1', 'user-alice');
    await adapter.upsertIdentity(siteId, 'visitor-2', 'user-bob');
  });

  afterAll(async () => {
    if (adapter) await adapter.close();
  });

  // ─── Site CRUD ──────────────────────────────────────────

  describe('site management', () => {
    it('creates and retrieves sites', async () => {
      const fetched = await adapter.getSite(siteId);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('Parity Test Site');
      expect(fetched?.conversionEvents).toEqual(['signup', 'purchase']);
    });

    it('lists sites', async () => {
      const sites = await adapter.listSites();
      expect(sites.length).toBeGreaterThan(0);
    });

    it('updates site fields', async () => {
      const updated = await adapter.updateSite(siteId, { name: 'Updated Name' });
      expect(updated?.name).toBe('Updated Name');
      // Restore for downstream tests
      await adapter.updateSite(siteId, { name: 'Parity Test Site' });
    });

    it('regenerates secret', async () => {
      const before = await adapter.getSite(siteId);
      const after = await adapter.regenerateSecret(siteId);
      expect(after?.secretKey).not.toBe(before?.secretKey);
    });

    it('finds site by secret', async () => {
      const site = await adapter.getSite(siteId);
      const bySecret = await adapter.getSiteBySecret(site!.secretKey);
      expect(bySecret?.siteId).toBe(siteId);
    });
  });

  // ─── Identity ────────────────────────────────────────────

  describe('identity mapping', () => {
    it('resolves user from visitor', async () => {
      const userId = await adapter.getUserIdForVisitor(siteId, 'visitor-1');
      expect(userId).toBe('user-alice');
    });

    it('resolves visitors for user', async () => {
      const visitors = await adapter.getVisitorIdsForUser(siteId, 'user-alice');
      expect(visitors).toContain('visitor-1');
    });

    it('upsert overwrites existing mapping', async () => {
      await adapter.upsertIdentity(siteId, 'visitor-1', 'user-alice-v2');
      const userId = await adapter.getUserIdForVisitor(siteId, 'visitor-1');
      expect(userId).toBe('user-alice-v2');
      // Restore
      await adapter.upsertIdentity(siteId, 'visitor-1', 'user-alice');
    });
  });

  // ─── Aggregate metrics ──────────────────────────────────

  describe('query() basic aggregates', () => {
    it('pageviews count matches fixture', async () => {
      const r = await adapter.query({ siteId, metric: 'pageviews', period: '30d' });
      expect(r.total).toBeGreaterThan(0);
      expect(r.data[0].key).toBe('pageviews');
    });

    it('visitors counts distinct', async () => {
      const r = await adapter.query({ siteId, metric: 'visitors', period: '30d' });
      expect(r.total).toBe(5); // visitor-1..5
    });

    it('sessions counts distinct', async () => {
      const r = await adapter.query({ siteId, metric: 'sessions', period: '30d' });
      expect(r.total).toBeGreaterThan(0);
    });

    it('events count', async () => {
      const r = await adapter.query({ siteId, metric: 'events', period: '30d' });
      expect(r.total).toBeGreaterThan(0);
    });

    it('conversions filter by event names', async () => {
      const r = await adapter.query({
        siteId, metric: 'conversions', period: '30d',
        conversionEvents: ['signup', 'purchase'],
      });
      expect(r.total).toBeGreaterThan(0);
    });

    it('compare returns previousTotal and changePercent', async () => {
      const r = await adapter.query({ siteId, metric: 'pageviews', period: '7d', compare: true });
      expect(r).toHaveProperty('previousTotal');
      expect(r).toHaveProperty('changePercent');
    });
  });

  // ─── Top-N metrics ──────────────────────────────────────

  describe('query() top-N metrics', () => {
    const topMetrics = [
      'top_pages', 'top_referrers', 'top_countries', 'top_cities', 'top_events',
      'top_exit_pages', 'top_transitions', 'top_scroll_pages', 'top_button_clicks',
      'top_link_targets', 'top_devices', 'top_browsers', 'top_os', 'top_os_versions',
      'top_device_models', 'top_app_versions', 'top_utm_sources', 'top_utm_mediums',
      'top_utm_campaigns', 'top_utm_terms', 'top_utm_contents', 'top_channels',
    ] as const;

    for (const metric of topMetrics) {
      it(`${metric} returns valid shape`, async () => {
        const r = await adapter.query({ siteId, metric, period: '30d' });
        expect(r.metric).toBe(metric);
        expect(Array.isArray(r.data)).toBe(true);
        for (const point of r.data) {
          expect(typeof point.key).toBe('string');
          expect(typeof point.value).toBe('number');
        }
      });
    }

    it('top_conversions with empty conversionEvents returns empty', async () => {
      const r = await adapter.query({ siteId, metric: 'top_conversions', period: '30d' });
      expect(r.data).toEqual([]);
    });

    it('top_conversions with conversionEvents returns data', async () => {
      const r = await adapter.query({
        siteId, metric: 'top_conversions', period: '30d',
        conversionEvents: ['signup', 'purchase'],
      });
      expect(r.data.length).toBeGreaterThan(0);
    });

    it('top_pages respects filters', async () => {
      const filtered = await adapter.query({
        siteId, metric: 'top_pages', period: '30d',
        filters: { 'geo.country': 'US' },
      });
      for (const point of filtered.data) {
        expect(typeof point.key).toBe('string');
      }
    });

    // Value-equivalence assertions — verify the SQL returns expected counts, not just shape.

    it('top_pages returns expected exact counts', async () => {
      const r = await adapter.query({ siteId, metric: 'top_pages', period: '30d' });
      const map = Object.fromEntries(r.data.map((d) => [d.key, d.value]));
      // /home: visitor-1, visitor-2 = 2 pageviews
      expect(map['https://test.example.com/home']).toBe(2);
      // /about: visitor-3 = 1 pageview
      expect(map['https://test.example.com/about']).toBe(1);
      // /landing: visitor-4, visitor-5 = 2 pageviews
      expect(map['https://test.example.com/landing']).toBe(2);
    });

    it('top_channels classifies UTM/referrer correctly', async () => {
      const r = await adapter.query({ siteId, metric: 'top_channels', period: '30d' });
      const map = Object.fromEntries(r.data.map((d) => [d.key, d.value]));
      // visitor-3: no referrer, no utm → Direct
      expect(map['Direct']).toBeGreaterThanOrEqual(1);
      // visitor-4: utm.medium=cpc + utm.source=google → Paid Search
      expect(map['Paid Search']).toBeGreaterThanOrEqual(1);
      // visitor-5: utm.source=instagram (no paid medium), referrer instagram → Organic Social
      expect(map['Organic Social']).toBeGreaterThanOrEqual(1);
    });

    it('top_utm_sources normalizes aliases', async () => {
      const r = await adapter.query({ siteId, metric: 'top_utm_sources', period: '30d' });
      const keys = r.data.map((d) => d.key);
      // visitor-4 'google' → 'Google', visitor-5 'instagram' → 'Instagram'
      expect(keys).toContain('Google');
      expect(keys).toContain('Instagram');
    });

    it('top_referrers normalizes hostnames', async () => {
      const r = await adapter.query({ siteId, metric: 'top_referrers', period: '30d' });
      const keys = r.data.map((d) => d.key);
      // www.instagram.com → instagram.com
      expect(keys).toContain('instagram.com');
      // www.google.com/search?... → google.com
      expect(keys).toContain('google.com');
    });
  });

  // ─── Time series ─────────────────────────────────────────

  describe('queryTimeSeries', () => {
    it('returns dense buckets at hour granularity', async () => {
      const r = await adapter.queryTimeSeries({
        siteId, metric: 'pageviews', period: '24h', granularity: 'hour',
      });
      expect(r.data.length).toBeGreaterThan(0);
      expect(r.granularity).toBe('hour');
    });

    it('returns dense buckets at day granularity', async () => {
      const r = await adapter.queryTimeSeries({
        siteId, metric: 'visitors', period: '7d', granularity: 'day',
      });
      expect(r.data.length).toBe(8); // 7d returns 7-8 daily buckets inclusive
      for (const p of r.data) {
        expect(typeof p.value).toBe('number');
      }
    });

    it('returns dense buckets at week granularity', async () => {
      const r = await adapter.queryTimeSeries({
        siteId, metric: 'events', period: '90d', granularity: 'week',
      });
      expect(r.data.length).toBeGreaterThan(0);
    });

    it('respects timezone', async () => {
      const r = await adapter.queryTimeSeries({
        siteId, metric: 'pageviews', period: '7d', granularity: 'day',
        timezone: 'America/New_York',
      });
      expect(r.data.length).toBeGreaterThan(0);
    });
  });

  // ─── Retention ───────────────────────────────────────────

  describe('queryRetention', () => {
    it('returns cohort data', async () => {
      const r = await adapter.queryRetention({ siteId, weeks: 4 });
      expect(r.cohorts).toBeDefined();
      expect(Array.isArray(r.cohorts)).toBe(true);
      for (const c of r.cohorts) {
        expect(typeof c.week).toBe('string');
        expect(typeof c.size).toBe('number');
        expect(Array.isArray(c.retention)).toBe(true);
      }
    });
  });

  // ─── Listing ─────────────────────────────────────────────

  describe('listEvents', () => {
    it('returns paginated list', async () => {
      const r = await adapter.listEvents({ siteId, limit: 5 });
      expect(r.events.length).toBeLessThanOrEqual(5);
      expect(r.total).toBeGreaterThan(0);
      expect(r.limit).toBe(5);
    });

    it('filters by type', async () => {
      const r = await adapter.listEvents({ siteId, type: 'pageview' });
      for (const e of r.events) {
        expect(e.type).toBe('pageview');
      }
    });

    it('filters by visitor', async () => {
      const r = await adapter.listEvents({ siteId, visitorId: 'visitor-1' });
      for (const e of r.events) {
        expect(e.visitorId).toBe('visitor-1');
      }
    });

    it('returns properties as parsed object', async () => {
      const r = await adapter.listEvents({ siteId, type: 'event' });
      const withProps = r.events.find((e) => e.properties !== undefined);
      if (withProps) {
        expect(typeof withProps.properties).toBe('object');
      }
    });
  });

  describe('listUsers', () => {
    it('returns user list with merged identities', async () => {
      const r = await adapter.listUsers({ siteId });
      expect(r.users.length).toBeGreaterThan(0);
      const alice = r.users.find((u) => u.userId === 'user-alice');
      expect(alice).toBeDefined();
      expect(alice?.totalEvents).toBeGreaterThan(0);
    });

    it('search by visitor id', async () => {
      const r = await adapter.listUsers({ siteId, search: 'visitor-3' });
      expect(r.users.length).toBeGreaterThan(0);
    });
  });

  describe('getUserDetail', () => {
    it('returns merged detail for known userId', async () => {
      const u = await adapter.getUserDetail(siteId, 'user-alice');
      expect(u).not.toBeNull();
      expect(u?.userId).toBe('user-alice');
      expect(u?.visitorIds).toContain('visitor-1');
    });

    it('returns merged detail when called with visitorId of known user', async () => {
      const u = await adapter.getUserDetail(siteId, 'visitor-1');
      expect(u).not.toBeNull();
      expect(u?.userId).toBe('user-alice');
    });

    it('returns null for unknown', async () => {
      const u = await adapter.getUserDetail(siteId, 'nope-nope');
      expect(u).toBeNull();
    });
  });

  describe('getUserEvents', () => {
    it('returns events for known userId', async () => {
      const r = await adapter.getUserEvents(siteId, 'user-alice', { siteId, limit: 50 });
      expect(r.events.length).toBeGreaterThan(0);
      for (const e of r.events) {
        expect(e.visitorId).toBe('visitor-1');
      }
    });
  });

  // ─── Site cleanup ────────────────────────────────────────

  describe('deleteSite', () => {
    it('soft-deletes (returns true)', async () => {
      const tempSite = await adapter.createSite({ name: 'Temp' });
      const ok = await adapter.deleteSite(tempSite.siteId);
      expect(ok).toBe(true);
      const fetched = await adapter.getSite(tempSite.siteId);
      expect(fetched).toBeNull();
    });
  });
});

// ─── Fixture builder ───────────────────────────────────────

function buildFixtureEvents(siteId: string): EnrichedEvent[] {
  const now = Date.now();
  const events: EnrichedEvent[] = [];

  // visitor-1 (US, Chrome, signs up)
  events.push(makePageview(siteId, 'visitor-1', 'session-1a', '/home', 'https://google.com/search', now - 1_000 * 60 * 60, { country: 'US' }, { browser: 'Chrome', os: 'macOS', type: 'desktop' }));
  events.push(makePageview(siteId, 'visitor-1', 'session-1a', '/pricing', 'https://test.example.com/home', now - 1_000 * 60 * 50, { country: 'US' }, { browser: 'Chrome', os: 'macOS', type: 'desktop' }));
  events.push(makeEvent(siteId, 'visitor-1', 'session-1a', 'signup', { plan: 'pro' }, now - 1_000 * 60 * 49));
  events.push(makeIdentify(siteId, 'visitor-1', 'session-1a', 'user-alice', { email: 'alice@example.com' }, now - 1_000 * 60 * 48));

  // visitor-2 (UK, Safari, second session, instagram referral)
  events.push(makePageview(siteId, 'visitor-2', 'session-2a', '/home', 'https://www.instagram.com/codixus', now - 1_000 * 60 * 60 * 12, { country: 'GB' }, { browser: 'Safari', os: 'iOS', type: 'mobile' }));
  events.push(makePageview(siteId, 'visitor-2', 'session-2a', '/blog', 'https://test.example.com/home', now - 1_000 * 60 * 60 * 11, { country: 'GB' }, { browser: 'Safari', os: 'iOS', type: 'mobile' }));
  events.push(makeEvent(siteId, 'visitor-2', 'session-2a', 'purchase', { amount: 99 }, now - 1_000 * 60 * 60 * 10));
  events.push(makeIdentify(siteId, 'visitor-2', 'session-2a', 'user-bob', { email: 'bob@example.com' }, now - 1_000 * 60 * 60 * 9));

  // visitor-3 (DE, anonymous, direct traffic, scroll event)
  events.push(makePageview(siteId, 'visitor-3', 'session-3a', '/about', null, now - 1_000 * 60 * 60 * 24, { country: 'DE' }, { browser: 'Firefox', os: 'Windows', type: 'desktop' }));
  events.push(makeScrollDepth(siteId, 'visitor-3', 'session-3a', '/about', 75, now - 1_000 * 60 * 60 * 23));
  events.push(makeButtonClick(siteId, 'visitor-3', 'session-3a', '/about', 'Sign Up', '#signup-btn', now - 1_000 * 60 * 60 * 22));

  // visitor-4 (Paid Search via Google CPC)
  events.push({
    type: 'pageview',
    siteId, visitorId: 'visitor-4', sessionId: 'session-4a', timestamp: now - 1_000 * 60 * 60 * 6,
    url: 'https://test.example.com/landing',
    referrer: 'https://www.google.com/search?q=foo',
    title: '/landing',
    geo: { country: 'US' },
    device: { type: 'desktop', browser: 'Chrome', os: 'macOS' },
    language: 'en-US',
    utm: { source: 'google', medium: 'cpc', campaign: 'spring-sale' },
  });

  // visitor-5 (Organic Social via Instagram referral, no UTM medium)
  events.push({
    type: 'pageview',
    siteId, visitorId: 'visitor-5', sessionId: 'session-5a', timestamp: now - 1_000 * 60 * 60 * 5,
    url: 'https://test.example.com/landing',
    referrer: 'https://www.instagram.com/p/abc',
    title: '/landing',
    geo: { country: 'US' },
    device: { type: 'mobile', browser: 'Safari', os: 'iOS' },
    language: 'en-US',
    utm: { source: 'instagram' },
  });

  return events;
}

function makePageview(siteId: string, visitorId: string, sessionId: string, path: string, referrer: string | null, ts: number, geo: { country: string }, device: { browser: string; os: string; type: string }): EnrichedEvent {
  return {
    type: 'pageview',
    siteId, visitorId, sessionId, timestamp: ts,
    url: `https://test.example.com${path}`,
    referrer: referrer ?? undefined,
    title: path,
    geo, device,
    language: 'en-US',
  };
}

function makeEvent(siteId: string, visitorId: string, sessionId: string, name: string, properties: Record<string, unknown>, ts: number): EnrichedEvent {
  return {
    type: 'event',
    siteId, visitorId, sessionId, timestamp: ts,
    name, properties,
    eventSource: 'manual',
    eventSubtype: 'custom',
  };
}

function makeIdentify(siteId: string, visitorId: string, sessionId: string, userId: string, traits: Record<string, unknown>, ts: number): EnrichedEvent {
  return {
    type: 'identify',
    siteId, visitorId, sessionId, timestamp: ts,
    userId, traits,
  };
}

function makeScrollDepth(siteId: string, visitorId: string, sessionId: string, pagePath: string, pct: number, ts: number): EnrichedEvent {
  return {
    type: 'event',
    siteId, visitorId, sessionId, timestamp: ts,
    name: 'scroll_depth',
    eventSource: 'auto',
    eventSubtype: 'scroll_depth',
    pagePath,
    scrollDepthPct: pct,
  };
}

function makeButtonClick(siteId: string, visitorId: string, sessionId: string, pagePath: string, text: string, selector: string, ts: number): EnrichedEvent {
  return {
    type: 'event',
    siteId, visitorId, sessionId, timestamp: ts,
    name: 'button_click',
    eventSource: 'auto',
    eventSubtype: 'button_click',
    pagePath,
    elementText: text,
    elementSelector: selector,
  };
}
