import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnrichedEvent } from '@litemetrics/core';

const {
  insertEvents,
  getSite,
  getSiteBySecret,
  query,
  queryTimeSeries,
  listEvents,
  listUsers,
  getUserEvents,
  deleteUserEvents,
} = vi.hoisted(() => ({
  insertEvents: vi.fn<(events: EnrichedEvent[]) => Promise<void>>(async () => {}),
  getSite: vi.fn<(siteId: string) => Promise<any>>(async () => null),
  getSiteBySecret: vi.fn<(secret: string) => Promise<any>>(async () => null),
  query: vi.fn<(params: any) => Promise<any>>(async () => ({})),
  queryTimeSeries: vi.fn<(params: any) => Promise<any>>(async () => ({})),
  listEvents: vi.fn<(params: any) => Promise<any>>(async () => ({})),
  listUsers: vi.fn<(params: any) => Promise<any>>(async () => ({})),
  getUserEvents: vi.fn<(siteId: string, identifier: string, params: any) => Promise<any>>(
    async () => ({}),
  ),
  deleteUserEvents: vi.fn<(siteId: string, identifier: string) => Promise<{ deleted: number }>>(
    async () => ({ deleted: 3 }),
  ),
}));

vi.mock('./adapters/clickhouse', () => {
  class ClickHouseAdapter {
    constructor(_url: string) {}
    init = async () => {};
    insertEvents = insertEvents;
    query = query;
    queryTimeSeries = queryTimeSeries;
    queryRetention = async () => ({});
    close = async () => {};
    listEvents = listEvents;
    listUsers = listUsers;
    getUserDetail = async () => null;
    getUserEvents = getUserEvents;
    upsertIdentity = async () => {};
    getVisitorIdsForUser = async () => [];
    getUserIdForVisitor = async () => null;
    createSite = async () => ({});
    getSite = getSite;
    getSiteBySecret = getSiteBySecret;
    listSites = async () => [];
    updateSite = async () => null;
    deleteSite = async () => false;
    regenerateSecret = async () => null;
    deleteUserEvents = deleteUserEvents;
  }
  return { ClickHouseAdapter };
});

vi.mock('./adapters/mongodb', () => ({
  MongoDBAdapter: class {
    constructor(_url: string) {}
  },
}));

import { createCollector } from './collector';

type MockRes = {
  statusCode: number;
  body: unknown;
  setHeader: (k: string, v: string) => void;
  writeHead: (s: number, h?: any) => void;
  end: (data?: string) => void;
  status: (s: number) => MockRes;
  json: (b: unknown) => void;
};

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    setHeader: () => {},
    writeHead: (s) => { res.statusCode = s; },
    end: (data) => { if (data) res.body = data; },
    status: (s) => { res.statusCode = s; return res; },
    json: (b) => { res.body = b; },
  };
  return res;
}

function makeReq(events: unknown[]) {
  return {
    method: 'POST',
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    body: { events },
    socket: { remoteAddress: '1.2.3.4' },
  };
}

function resetAdapterMocks() {
  insertEvents.mockClear();
  insertEvents.mockImplementation(async () => {});
  getSite.mockClear();
  getSite.mockImplementation(async () => null);
  getSiteBySecret.mockClear();
  getSiteBySecret.mockImplementation(async () => null);
  query.mockClear();
  query.mockImplementation(async () => ({}));
  queryTimeSeries.mockClear();
  queryTimeSeries.mockImplementation(async () => ({}));
  listEvents.mockClear();
  listEvents.mockImplementation(async () => ({}));
  listUsers.mockClear();
  listUsers.mockImplementation(async () => ({}));
  getUserEvents.mockClear();
  getUserEvents.mockImplementation(async () => ({}));
  deleteUserEvents.mockClear();
  deleteUserEvents.mockImplementation(async () => ({ deleted: 3 }));
}

describe('collector timestamp sanitization', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  const baseEvent = (timestamp: number) => ({
    type: 'pageview',
    siteId: 'site-1',
    sessionId: 'sess',
    visitorId: 'vis',
    timestamp,
    url: 'https://example.com/',
  });

  it('drops far-future timestamps by default', async () => {
    const collector = await createCollector({ db: { url: 'http://localhost:8123' } });
    const future = Date.now() + 60 * 60 * 1000;
    await collector.handler()(makeReq([baseEvent(future)]), makeRes());

    expect(insertEvents).toHaveBeenCalledTimes(1);
    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(0);
  });

  it('drops far-past timestamps by default', async () => {
    const collector = await createCollector({ db: { url: 'http://localhost:8123' } });
    const past = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await collector.handler()(makeReq([baseEvent(past)]), makeRes());

    expect(insertEvents).toHaveBeenCalledTimes(1);
    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(0);
  });

  it('drops only the bad event in a mixed batch', async () => {
    const collector = await createCollector({ db: { url: 'http://localhost:8123' } });
    const goodTs = Date.now() - 30 * 1000;
    const badTs = Date.now() + 60 * 60 * 1000;
    await collector.handler()(
      makeReq([baseEvent(goodTs), baseEvent(badTs)]),
      makeRes(),
    );

    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(1);
    expect(events[0]!.timestamp).toBe(goodTs);
  });

  it("replaces with server-now when mode is 'clamp'", async () => {
    const collector = await createCollector({
      db: { url: 'http://localhost:8123' },
      timestampSanity: { mode: 'clamp' },
    });
    const future = Date.now() + 60 * 60 * 1000;
    const before = Date.now();
    await collector.handler()(makeReq([baseEvent(future)]), makeRes());
    const after = Date.now();

    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(1);
    expect(events[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  it('preserves in-window client timestamps', async () => {
    const collector = await createCollector({ db: { url: 'http://localhost:8123' } });
    const ts = Date.now() - 30 * 1000;
    await collector.handler()(makeReq([baseEvent(ts)]), makeRes());

    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(1);
    expect(events[0]!.timestamp).toBe(ts);
  });

  it("preserves out-of-window timestamps when mode is 'off'", async () => {
    const collector = await createCollector({
      db: { url: 'http://localhost:8123' },
      timestampSanity: { mode: 'off' },
    });
    const future = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await collector.handler()(makeReq([baseEvent(future)]), makeRes());

    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(1);
    expect(events[0]!.timestamp).toBe(future);
  });

  it('respects custom futureMs window', async () => {
    const collector = await createCollector({
      db: { url: 'http://localhost:8123' },
      timestampSanity: { futureMs: 60_000, mode: 'clamp' },
    });
    const future = Date.now() + 2 * 60_000;
    const before = Date.now();
    await collector.handler()(makeReq([baseEvent(future)]), makeRes());
    const after = Date.now();

    const [events] = insertEvents.mock.calls[0] as [EnrichedEvent[]];
    expect(events).toHaveLength(1);
    expect(events[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  it('invokes onOutOfWindow callback when dropping events', async () => {
    const onOutOfWindow = vi.fn();
    const collector = await createCollector({
      db: { url: 'http://localhost:8123' },
      timestampSanity: { onOutOfWindow },
    });
    const future = Date.now() + 60 * 60 * 1000;
    await collector.handler()(makeReq([baseEvent(future)]), makeRes());

    expect(onOutOfWindow).toHaveBeenCalledTimes(1);
    expect(onOutOfWindow.mock.calls[0]![0].reason).toBe('future');
    expect(onOutOfWindow.mock.calls[0]![0].event.siteId).toBe('site-1');
  });
});

describe('collector bot filtering', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  function makeBotReq(ua: string, headers: Record<string, string> = {}) {
    return {
      method: 'POST',
      headers: { 'user-agent': ua, ...headers },
      body: { events: [{ siteId: 'site_test', visitorId: 'v1', sessionId: 's1', type: 'pageview', name: '$pageview', timestamp: Date.now(), url: 'https://x.test/' }] },
      socket: { remoteAddress: '9.9.9.9' },
    };
  }

  it('drops layer-1 (signature) hits in standard mode', async () => {
    const collector = await createCollector({ db: { adapter: 'clickhouse', url: 'http://x' } });
    const handler = collector.handler();
    const res = makeRes();
    await handler(makeBotReq('curl/8.0.0'), res);
    expect(insertEvents).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200); // silent drop
  });

  // Note: an integration test for "standard mode does NOT drop heuristic hits" is
  // omitted because isbot v5 already classifies bare `Mozilla/5.0` as a signature
  // bot, leaving no realistic UA that (a) escapes isbot AND (b) trips the heuristic
  // without mocking. The strict-mode case below proves the heuristic layer fires
  // when enabled; the off-mode and shadow-mode cases below prove the mode gate.

  it('drops heuristic hits in strict mode', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict' },
    });
    const handler = collector.handler();
    const res = makeRes();
    await handler(makeBotReq('Mozilla/5.0'), res);
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it('flags but does not drop in shadow mode, persists botFlag', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'shadow' },
    });
    const handler = collector.handler();
    const res = makeRes();
    await handler(makeBotReq('curl/8.0.0'), res);
    expect(insertEvents).toHaveBeenCalledOnce();
    const events = insertEvents.mock.calls[0][0];
    expect(events[0].botFlag).toBe('signature');
  });

  it('skips all checks in off mode', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'off' },
    });
    const handler = collector.handler();
    const res = makeRes();
    await handler(makeBotReq('curl/8.0.0'), res);
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0][0][0].botFlag).toBeUndefined();
  });

  it('invokes onBotDetected callback with layer + action + mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq('curl/8.0.0'), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'signature', action: 'dropped', mode: 'standard' }),
    );
  });
});

describe('collector deleteUserEvents endpoint', () => {
  it('rejects unauthenticated DELETE requests', async () => {
    const collector = await createCollector({ db: { adapter: 'clickhouse', url: 'http://x' } });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      { method: 'DELETE', url: '/api/users/v1/events', headers: {}, query: { siteId: 'site_test' } },
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('admin can delete user events and gets count back', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      adminSecret: 'admin-secret',
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/visitor-abc/events',
        headers: { 'x-litemetrics-admin-secret': 'admin-secret' },
        query: { siteId: 'site_test' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, deleted: expect.any(Number) });
  });

  it('returns 400 when siteId is missing', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      adminSecret: 'admin-secret',
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/visitor-abc/events',
        headers: { 'x-litemetrics-admin-secret': 'admin-secret' },
        query: {},
      },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('collector per-site bot filter override', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  function makeReqFor(ua: string, headers: Record<string, string> = {}) {
    return {
      method: 'POST',
      headers: { 'user-agent': ua, ...headers },
      body: {
        events: [
          {
            siteId: 'site_test',
            visitorId: 'v1',
            sessionId: 's1',
            type: 'pageview',
            name: '$pageview',
            timestamp: Date.now(),
            url: 'https://x.test/',
          },
        ],
      },
      socket: { remoteAddress: '9.9.9.9' },
    };
  }

  it("site.botFilterMode='strict' overrides server default 'standard' (drops heuristic hit)", async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test',
      name: 'Test',
      secretKey: 'k',
      botFilterMode: 'strict',
    }));
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    const handler = collector.handler();
    const res = makeRes();
    // bare Mozilla/5.0 trips the heuristic layer (which is gated off in standard mode).
    await handler(makeReqFor('Mozilla/5.0'), res);
    // With per-site strict, the heuristic layer activates and drops it.
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("site.botFilterMode='off' disables filtering even when server default is 'standard'", async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test',
      name: 'Test',
      secretKey: 'k',
      botFilterMode: 'off',
    }));
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    const handler = collector.handler();
    const res = makeRes();
    await handler(makeReqFor('curl/8.0.0'), res); // signature-bot UA
    // Off-mode → bypasses all filtering, signature bot is inserted with no botFlag.
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
  });

  it("onBotDetected receives action='flagged' (not 'dropped') in shadow mode", async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'shadow', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeReqFor('curl/8.0.0'), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'signature', action: 'flagged', mode: 'shadow' }),
    );
  });

  it('signature-bot UA in standard mode drops the entire batch (no events inserted)', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    const handler = collector.handler();
    const res = makeRes();
    // Multi-event batch from a signature-bot UA. The whole batch must be silently dropped.
    const ts = Date.now();
    await handler(
      {
        method: 'POST',
        headers: { 'user-agent': 'curl/8.0.0' },
        body: {
          events: [
            {
              siteId: 'site_test',
              visitorId: 'v1',
              sessionId: 's1',
              type: 'pageview',
              timestamp: ts,
              url: 'https://x.test/a',
            },
            {
              siteId: 'site_test',
              visitorId: 'v1',
              sessionId: 's1',
              type: 'event',
              name: 'click',
              timestamp: ts,
            },
            {
              siteId: 'site_test',
              visitorId: 'v1',
              sessionId: 's1',
              type: 'pageview',
              timestamp: ts,
              url: 'https://x.test/b',
            },
          ],
        },
        socket: { remoteAddress: '9.9.9.9' },
      },
      res,
    );
    expect(insertEvents).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

describe('collector deleteUserEvents - extended auth + path cases', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  it('site-secret auth: matching X-Litemetrics-Secret returns 200 and calls adapter', async () => {
    getSiteBySecret.mockImplementation(async (secret: string) =>
      secret === 'site-secret-abc'
        ? { siteId: 'site_test', name: 'Test', secretKey: 'site-secret-abc' }
        : null,
    );
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      // no adminSecret - rely purely on site-secret path
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/visitor-abc/events',
        headers: { 'x-litemetrics-secret': 'site-secret-abc' },
        query: { siteId: 'site_test' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(deleteUserEvents).toHaveBeenCalledWith('site_test', 'visitor-abc');
    expect(res.body).toMatchObject({ ok: true, deleted: expect.any(Number) });
  });

  it('site-secret auth: wrong secret returns 401', async () => {
    getSiteBySecret.mockImplementation(async () => null); // no match
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/visitor-abc/events',
        headers: { 'x-litemetrics-secret': 'wrong' },
        query: { siteId: 'site_test' },
      },
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(deleteUserEvents).not.toHaveBeenCalled();
  });

  it('URL-encoded identifier is decoded before adapter call', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      adminSecret: 'admin-secret',
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    // visitor id with a colon and a space → "user:1 special"
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/user%3A1%20special/events',
        headers: { 'x-litemetrics-admin-secret': 'admin-secret' },
        query: { siteId: 'site_test' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(deleteUserEvents).toHaveBeenCalledWith('site_test', 'user:1 special');
  });

  it('returns 400 when path is /api/users/:id/<wrong-suffix>', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      adminSecret: 'admin-secret',
    });
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      {
        method: 'DELETE',
        url: '/api/users/visitor-abc/wrong-suffix',
        headers: { 'x-litemetrics-admin-secret': 'admin-secret' },
        query: { siteId: 'site_test' },
      },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(deleteUserEvents).not.toHaveBeenCalled();
  });
});

describe('collector includeBots query param plumbing', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  function makeAuthedGet(url: string) {
    return {
      method: 'GET',
      url,
      headers: { 'x-litemetrics-admin-secret': 'admin-secret' },
    };
  }

  async function makeAuthedCollector() {
    return createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      adminSecret: 'admin-secret',
    });
  }

  // ── eventsHandler (listEvents) ────────────────────────

  it("?includeBots=true reaches db.listEvents with includeBots=true", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    await handler(
      makeAuthedGet('/api/events?siteId=site_test&includeBots=true'),
      makeRes(),
    );
    expect(listEvents).toHaveBeenCalledOnce();
    expect(listEvents.mock.calls[0]![0]).toMatchObject({
      siteId: 'site_test',
      includeBots: true,
    });
  });

  it("?includeBots=1 is also accepted as truthy", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    await handler(
      makeAuthedGet('/api/events?siteId=site_test&includeBots=1'),
      makeRes(),
    );
    expect(listEvents.mock.calls[0]![0].includeBots).toBe(true);
  });

  it("?includeBots=false is treated as exclude-bots (false)", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    await handler(
      makeAuthedGet('/api/events?siteId=site_test&includeBots=false'),
      makeRes(),
    );
    expect(listEvents.mock.calls[0]![0].includeBots).toBe(false);
  });

  it("?includeBots=0 is treated as exclude-bots (false)", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    await handler(
      makeAuthedGet('/api/events?siteId=site_test&includeBots=0'),
      makeRes(),
    );
    expect(listEvents.mock.calls[0]![0].includeBots).toBe(false);
  });

  it("missing includeBots param → false (default exclude bots)", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    await handler(makeAuthedGet('/api/events?siteId=site_test'), makeRes());
    expect(listEvents.mock.calls[0]![0].includeBots).toBe(false);
  });

  // ── usersHandler (listUsers) ───────────────────────────

  it("listUsers: ?includeBots=true reaches db.listUsers with includeBots=true", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.usersHandler();
    await handler(
      makeAuthedGet('/api/users?siteId=site_test&includeBots=true'),
      makeRes(),
    );
    expect(listUsers).toHaveBeenCalledOnce();
    expect(listUsers.mock.calls[0]![0]).toMatchObject({
      siteId: 'site_test',
      includeBots: true,
    });
  });

  it("listUsers: missing param → includeBots=false", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.usersHandler();
    await handler(makeAuthedGet('/api/users?siteId=site_test'), makeRes());
    expect(listUsers.mock.calls[0]![0].includeBots).toBe(false);
  });

  // ── queryHandler (db.query) ────────────────────────────

  it("query: ?includeBots=true reaches db.query with includeBots=true", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    await handler(
      makeAuthedGet('/api/query?siteId=site_test&metric=pageviews&includeBots=true'),
      makeRes(),
    );
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]![0]).toMatchObject({
      siteId: 'site_test',
      metric: 'pageviews',
      includeBots: true,
    });
  });

  it("query: missing includeBots → false", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    await handler(
      makeAuthedGet('/api/query?siteId=site_test&metric=pageviews'),
      makeRes(),
    );
    expect(query.mock.calls[0]![0].includeBots).toBe(false);
  });

  // ── R3: timeseries bucket-budget rejection surfaces as 400 ──

  it("timeseries: a QueryValidationError from the adapter is mapped to HTTP 400", async () => {
    const { QueryValidationError } = await import('./adapters/utils');
    queryTimeSeries.mockImplementation(async () => {
      throw new QueryValidationError('Time range too large for "hour" granularity: 2161 buckets exceeds the 2000-bucket limit.');
    });
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet('/api/query?siteId=site_test&metric=timeseries&tsMetric=pageviews&period=90d&granularity=hour'),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
    expect((res.body as { error: string }).error).toContain('2000-bucket limit');
  });

  it("query: a generic adapter error still maps to HTTP 500", async () => {
    query.mockImplementation(async () => {
      throw new Error('connection refused');
    });
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet('/api/query?siteId=site_test&metric=pageviews'),
      res,
    );
    expect(res.statusCode).toBe(500);
  });

  it("query: a non-Error throw (e.g. null) is handled without crashing → 500", async () => {
    query.mockImplementation(async () => {
      throw null;
    });
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    const res = makeRes();
    // must resolve (the catch must not itself throw on `null.statusCode`)
    await expect(
      handler(makeAuthedGet('/api/query?siteId=site_test&metric=pageviews'), res),
    ).resolves.toBeUndefined();
    expect(res.statusCode).toBe(500);
  });

  // ── per-user events handler ────────────────────────────

  it("getUserEvents: ?includeBots=true reaches adapter", async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.usersHandler();
    await handler(
      makeAuthedGet(
        '/api/users/visitor-abc/events?siteId=site_test&includeBots=true',
      ),
      makeRes(),
    );
    expect(getUserEvents).toHaveBeenCalledOnce();
    const [siteId, identifier, params] = getUserEvents.mock.calls[0]!;
    expect(siteId).toBe('site_test');
    expect(identifier).toBe('visitor-abc');
    expect(params).toMatchObject({ includeBots: true });
  });
});
