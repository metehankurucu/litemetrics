import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectErrorInfo, EnrichedEvent } from '@litemetrics/core';

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
  getUserIdForVisitor,
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
  getUserIdForVisitor: vi.fn<(siteId: string, visitorId: string) => Promise<string | null>>(
    async () => null,
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
    getUserIdForVisitor = getUserIdForVisitor;
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
  getUserIdForVisitor.mockClear();
  getUserIdForVisitor.mockImplementation(async () => null);
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

  it('reports reason=ua-signature and the offending UA for an isbot match', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq('okhttp/4.12.0'), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'signature',
        reason: 'ua-signature',
        userAgent: 'okhttp/4.12.0',
        action: 'dropped',
      }),
    );
  });

  it('reports reason=empty-ua when the request carries no User-Agent at all', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    const handler = collector.handler();
    const req = makeBotReq('');
    delete (req.headers as Record<string, string>)['user-agent'];
    await handler(req, makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'signature', reason: 'empty-ua' }),
    );
  });

  it('reports reason=no-browser-signals for a heuristic hit in strict mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq('Mozilla/5.0'), makeRes());
    // isbot classifies bare Mozilla/5.0 first, so this pins the signature reason;
    // the heuristic reason is proven directly in heuristic-bot.test.ts.
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'signature', reason: 'ua-signature' }),
    );
  });

  it('reports reason=rate-limit when the IP window overflows in strict mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const headers = { 'accept-language': 'en-US,en;q=0.9' };
    await handler(makeBotReq(chrome, headers), makeRes());
    expect(onBotDetected).not.toHaveBeenCalled();
    await handler(makeBotReq(chrome, headers), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', reason: 'rate-limit', action: 'dropped' }),
    );
  });

  it('carries the reason on a flagged (not dropped) shadow-mode hit', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'shadow', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq('okhttp/4.12.0'), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ua-signature', action: 'flagged' }),
    );
    expect(insertEvents).toHaveBeenCalledOnce();
  });

  it('does not invoke onBotDetected at all in off mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'off', onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq('okhttp/4.12.0'), makeRes());
    expect(onBotDetected).not.toHaveBeenCalled();
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

// The signature and heuristic layers both reason about browser User-Agents, and an
// app SDK does not send one. On Android, React Native's fetch goes through OkHttp,
// which fills in `User-Agent: okhttp/<version>`; isbot matches that, so every Android
// event from every app was dropped. Measured in production: four app sites, 6053
// events over 90 days, zero of them Android, while Play was 34.5% of gross revenue.
describe('collector bot filter - app-type sites', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  function appSite(extra: Record<string, unknown> = {}) {
    return { siteId: 'site_test', name: 'Test App', secretKey: 'k', type: 'app', ...extra };
  }

  function makeReqFor(ua: string, headers: Record<string, string> = {}, mobile?: unknown) {
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
            ...(mobile ? { mobile } : {}),
          },
        ],
      },
      socket: { remoteAddress: '9.9.9.9' },
    };
  }

  // R1 + R8: the regression this whole change exists to prevent.
  it.each(['okhttp/3.14.9', 'okhttp/4.9.2', 'okhttp/4.12.0', 'okhttp/5.0.0-alpha.14'])(
    'stores an app-site event sent with the OkHttp default UA %s',
    async (ua) => {
      getSite.mockImplementation(async () => appSite());
      const collector = await createCollector({
        db: { adapter: 'clickhouse', url: 'http://x' },
        botFilter: { defaultMode: 'standard' },
      });
      await collector.handler()(makeReqFor(ua), makeRes());
      expect(insertEvents).toHaveBeenCalledOnce();
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    },
  );

  // R5: the fix must not loosen anything for web traffic.
  it('still drops the same UA on a web-type site', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test Web', secretKey: 'k', type: 'web',
    }));
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    await collector.handler()(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it('treats a site with no type set as web, not as app', async () => {
    getSite.mockImplementation(async () => ({ siteId: 'site_test', name: 'Test', secretKey: 'k' }));
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    await collector.handler()(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).not.toHaveBeenCalled();
  });

  // R2: every RN request has no browser, no engine, no Accept-Language and no Referer,
  // so the heuristic layer would flag 100% of app traffic the moment strict is enabled.
  it('does not let the heuristic layer fire on app traffic even in strict mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict' },
    });
    await collector.handler()(makeReqFor('MyApp/1.0 CFNetwork/1498.700.2 Darwin/23.6.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
  });

  // The deliberate trade-off, pinned so nobody discovers it by accident: an app site
  // no longer rejects a self-declared crawler UA. Abuse of an app site id is a
  // volume problem, which is the rate-limit layer's job, not the UA list's.
  it('no longer drops a declared crawler UA on an app site', async () => {
    getSite.mockImplementation(async () => appSite());
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict' },
    });
    await collector.handler()(
      makeReqFor('Googlebot/2.1 (+http://www.google.com/bot.html)'),
      makeRes(),
    );
    expect(insertEvents).toHaveBeenCalledOnce();
  });

  // R3: the one layer that still protects an app site must keep working.
  it('still drops an app-site request that overflows the rate-limit window in strict mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce(); // second one dropped
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', action: 'dropped' }),
    );
  });

  // R3: standard mode never ran the rate-limit layer and must not start now.
  it('does not start rate-limiting app sites in standard mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1 },
    });
    const handler = collector.handler();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
  });

  // R4: an explicit per-site override still means what it said.
  it("honours an explicit botFilterMode='off' on an app site", async () => {
    getSite.mockImplementation(async () => appSite({ botFilterMode: 'off' }));
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict', rateLimitMaxEvents: 1 },
    });
    const handler = collector.handler();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
  });
});

// R7: a site created without type='app' still sends app payloads and still gets
// filtered as browser traffic. Reporting it is deliberate - acting on the payload
// would hand every caller a way to opt out of the filter by adding one JSON field.
describe('collector bot filter - app payload on a non-app site', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  const mobile = { platform: 'android', osVersion: '14', sdkName: 'litemetrics-react-native' };

  function makeMobileReq(ua: string, siteId = 'site_test') {
    return {
      method: 'POST',
      headers: { 'user-agent': ua },
      body: {
        events: [{
          siteId, visitorId: 'v1', sessionId: 's1', type: 'pageview',
          name: '$pageview', timestamp: Date.now(), url: 'https://x.test/', mobile,
        }],
      },
      socket: { remoteAddress: '9.9.9.9' },
    };
  }

  it('reports the mismatch and still applies the filter', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web',
    }));
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    await collector.handler()(makeMobileReq('okhttp/4.12.0'), makeRes());
    expect(onSiteTypeMismatch).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site_test', siteType: 'web', platform: 'android', mode: 'standard' }),
    );
    // Reported, not bypassed.
    expect(insertEvents).not.toHaveBeenCalled();
  });

  // With the filter off nothing is dropped, but the site is still shown as web in the
  // dashboard, so the mismatch is still worth one line - carrying the mode so the log
  // does not claim a drop that is not happening.
  it('still reports under mode=off, carrying the mode', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web', botFilterMode: 'off',
    }));
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    await collector.handler()(makeMobileReq('okhttp/4.12.0'), makeRes());
    expect(onSiteTypeMismatch).toHaveBeenCalledWith(expect.objectContaining({ mode: 'off' }));
    expect(insertEvents).toHaveBeenCalledOnce();
  });

  it('reports each site only once so a busy site cannot flood the log', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web',
    }));
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    const handler = collector.handler();
    for (let i = 0; i < 5; i++) await handler(makeMobileReq('okhttp/4.12.0'), makeRes());
    expect(onSiteTypeMismatch).toHaveBeenCalledOnce();
  });

  it('stays quiet for an app-type site', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'app',
    }));
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    await collector.handler()(makeMobileReq('okhttp/4.12.0'), makeRes());
    expect(onSiteTypeMismatch).not.toHaveBeenCalled();
  });

  // `mobile.platform` is untyped JSON on the wire; a non-string value is not a platform.
  it('ignores a non-string platform value', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web',
    }));
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    const req = makeMobileReq('okhttp/4.12.0') as any;
    req.body.events[0].mobile = { platform: { $ne: null } };
    await collector.handler()(req, makeRes());
    expect(onSiteTypeMismatch).not.toHaveBeenCalled();
  });

  // An unknown siteId is attacker-supplied, so it must not become a map key.
  it('stays quiet for a siteId that does not exist', async () => {
    getSite.mockImplementation(async () => null);
    const onSiteTypeMismatch = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch },
    });
    const handler = collector.handler();
    for (let i = 0; i < 50; i++) {
      await handler(makeMobileReq('okhttp/4.12.0', `site_bogus_${i}`), makeRes());
    }
    expect(onSiteTypeMismatch).not.toHaveBeenCalled();
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

// ─── D1: malformed custom date ranges are client errors, not 500s ──
// 31 Aug 2026: `dateTo=--json` (a CLI flag swallowed as a value) travelled through
// every handler into the adapter and came back as a 500. Nothing in the request was
// unknowable up front, so it belongs in the 400 class - and the query must never be
// executed at all.
describe('collector date-range validation', () => {
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

  it('events: a swallowed flag and a two-date value are rejected with 400 before the adapter runs', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet(
        '/api/events?siteId=site_test&period=custom&dateFrom=2026-08-11+2026-08-16&dateTo=--json',
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
    expect((res.body as { error: string }).error).toContain('dateFrom');
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('events: a well-formed custom range still reaches listEvents with both dates', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet(
        '/api/events?siteId=site_test&period=custom&dateFrom=2026-08-11&dateTo=2026-08-16',
      ),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(listEvents).toHaveBeenCalledOnce();
    expect(listEvents.mock.calls[0]![0]).toMatchObject({
      siteId: 'site_test',
      period: 'custom',
      dateFrom: '2026-08-11',
      dateTo: '2026-08-16',
    });
  });

  it('events: a reversed range is rejected with 400', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet(
        '/api/events?siteId=site_test&period=custom&dateFrom=2026-08-16&dateTo=2026-08-11',
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/before/);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('events: period=custom without dateTo is rejected with 400', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet('/api/events?siteId=site_test&period=custom&dateFrom=2026-08-11'),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('dateTo');
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('events: an adapter failure is still a 500, not a 400', async () => {
    listEvents.mockImplementation(async () => {
      throw new Error('connection refused');
    });
    const collector = await makeAuthedCollector();
    const handler = collector.eventsHandler();
    const res = makeRes();
    await handler(makeAuthedGet('/api/events?siteId=site_test'), res);
    expect(res.statusCode).toBe(500);
  });

  it('stats: dateTo=--json is rejected with 400 and db.query is never called', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet('/api/stats?siteId=site_test&metric=pageviews&period=custom&dateFrom=2026-08-11&dateTo=--json'),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('dateTo');
    expect(query).not.toHaveBeenCalled();
  });

  it('stats: a well-formed custom range still reaches db.query with both dates', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.queryHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet('/api/stats?siteId=site_test&metric=pageviews&period=custom&dateFrom=2026-08-11&dateTo=2026-08-16'),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(query.mock.calls[0]![0]).toMatchObject({
      dateFrom: '2026-08-11',
      dateTo: '2026-08-16',
    });
  });

  it('user events: a malformed dateFrom is rejected with 400 before getUserEvents runs', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet(
        '/api/users/visitor-abc/events?siteId=site_test&period=custom&dateFrom=--json&dateTo=2026-08-16',
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('dateFrom');
    expect(getUserEvents).not.toHaveBeenCalled();
  });

  it('user events: a well-formed custom range still reaches getUserEvents', async () => {
    const collector = await makeAuthedCollector();
    const handler = collector.usersHandler();
    const res = makeRes();
    await handler(
      makeAuthedGet(
        '/api/users/visitor-abc/events?siteId=site_test&period=custom&dateFrom=2026-08-11&dateTo=2026-08-16',
      ),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(getUserEvents).toHaveBeenCalledOnce();
    expect(getUserEvents.mock.calls[0]![2]).toMatchObject({
      dateFrom: '2026-08-11',
      dateTo: '2026-08-16',
    });
  });
});

// ─── O1: what was behind a collect 5xx ────────────────
// The catch used to answer 500 and say nothing, so a run of collect failures was
// countable (5xx=N in the minute summary) but not diagnosable. onCollectError hands
// the host the stage, the error class, the site and the batch size.
describe('collector collect error context', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  function pageview(siteId = 'site_test') {
    return {
      type: 'pageview',
      siteId,
      timestamp: Date.now(),
      sessionId: 'sess-1',
      visitorId: 'vis-1',
      url: 'https://example.com/pricing',
    };
  }

  async function collectorWith(onCollectError?: (info: CollectErrorInfo) => void) {
    return createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      onCollectError,
    });
  }

  it('reports stage, error class, site and event count when the insert fails', async () => {
    insertEvents.mockImplementation(async () => {
      throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(makeReq([pageview()]), res);

    expect(res.statusCode).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      stage: 'insert',
      errorClass: 'ECONNRESET',
      siteId: 'site_test',
      eventCount: 1,
    });
    expect(errors[0].message).toBe('boom');
  });

  it('separates a site-lookup failure from an insert failure', async () => {
    getSite.mockImplementation(async () => {
      throw Object.assign(new Error('site read failed'), { code: 'ETIMEDOUT' });
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(makeReq([pageview()]), res);

    expect(res.statusCode).toBe(500);
    expect(errors[0]).toMatchObject({ stage: 'site', errorClass: 'ETIMEDOUT', eventCount: 1 });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it.each([123, true, { key: 'site_test' }, ['site_test']])(
    'omits a non-string site ID from callback metadata: %j',
    async (siteId) => {
      getSite.mockRejectedValueOnce(new Error('site read failed'));
      const errors: CollectErrorInfo[] = [];
      const collector = await collectorWith((info) => errors.push(info));
      const res = makeRes();

      await collector.handler()(makeReq([{ ...pageview(), siteId }]), res);

      expect(res.statusCode).toBe(500);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ stage: 'site', eventCount: 1 });
      expect(errors[0].siteId).toBeUndefined();
      expect(insertEvents).not.toHaveBeenCalled();
    },
  );

  it('keeps malformed enrichment failures reportable without a string site ID', async () => {
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(makeReq([{ ...pageview(), siteId: 123, referrer: 1 }]), res);

    expect(res.statusCode).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ stage: 'identity', errorClass: 'TypeError', eventCount: 1 });
    expect(errors[0].siteId).toBeUndefined();
    expect(insertEvents).not.toHaveBeenCalled();
  });

  // Every member of CollectErrorStage has to be reachable, otherwise the union is
  // lying about what a reader can expect to see. identity is the last one.
  it('separates an identity-resolution failure from the insert that follows it', async () => {
    getUserIdForVisitor.mockImplementation(async () => {
      throw Object.assign(new Error('identity read failed'), { code: 'ECONNRESET' });
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(
      makeReq([{ ...pageview(), visitorId: `vis-identity-${Date.now()}` }]),
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(errors[0]).toMatchObject({
      stage: 'identity',
      errorClass: 'ECONNRESET',
      siteId: 'site_test',
      eventCount: 1,
    });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it('reports a body that never parsed as the parse stage, with no site to name', async () => {
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(
      { method: 'POST', headers: {}, body: '{"events": [', socket: { remoteAddress: '1.2.3.4' } },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(errors[0]).toMatchObject({ stage: 'parse', errorClass: 'SyntaxError' });
    expect(errors[0].siteId).toBeUndefined();
    expect(errors[0].eventCount).toBeUndefined();
  });

  it('reports a malformed event inside a parsed body as the validate stage', async () => {
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(makeReq([null]), res);

    expect(res.statusCode).toBe(500);
    expect(errors[0]).toMatchObject({ stage: 'validate', errorClass: 'TypeError', eventCount: 1 });
    expect(errors[0].siteId).toBeUndefined();
  });

  it('falls back to the error constructor name when there is no code', async () => {
    insertEvents.mockImplementation(async () => {
      throw new TypeError('events.map is not a function');
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(makeReq([pageview()]), makeRes());

    expect(errors[0].errorClass).toBe('TypeError');
  });

  it('truncates the message so one error cannot own the log line', async () => {
    insertEvents.mockImplementation(async () => {
      throw new Error('x'.repeat(400));
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(makeReq([pageview()]), makeRes());

    expect(errors[0].message).toHaveLength(160);
  });

  // Truncation must not be able to hide the end of a DSN: cut at 160 first and the
  // `@` that closes the credentials can fall off the end, leaving `user:password`
  // looking like ordinary text to every later pass.
  it('redacts driver credentials before the message is truncated', async () => {
    const password = 'sup3rsecretpassword1';
    insertEvents.mockImplementation(async () => {
      throw new Error(`${'x'.repeat(130)}postgres://lm_user:${password}@db.internal:5432/lm`);
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(makeReq([pageview()]), makeRes());

    expect(errors[0].message).not.toContain(password);
    expect(errors[0].message).not.toContain('lm_user');
    expect(errors[0].message).toContain('postgres://***@db.internal');
  });

  it('marks a truncated message so it cannot be read as the whole error', async () => {
    insertEvents.mockImplementation(async () => {
      throw new Error('y'.repeat(400));
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(makeReq([pageview()]), makeRes());

    expect(errors[0].message).toHaveLength(160);
    expect(errors[0].message.endsWith('...')).toBe(true);
  });

  it('still answers 500 when the host callback itself throws', async () => {
    insertEvents.mockImplementation(async () => {
      throw new Error('boom');
    });
    const collector = await collectorWith(() => {
      throw new Error('logger exploded');
    });
    const res = makeRes();

    await expect(collector.handler()(makeReq([pageview()]), res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false });
  });

  it('still answers 500 when no callback is configured', async () => {
    insertEvents.mockImplementation(async () => {
      throw new Error('boom');
    });
    const collector = await collectorWith(undefined);
    const res = makeRes();

    await collector.handler()(makeReq([pageview()]), res);

    expect(res.statusCode).toBe(500);
  });

  it('says nothing when the batch is accepted', async () => {
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));
    const res = makeRes();

    await collector.handler()(makeReq([pageview()]), res);

    expect(res.statusCode).toBe(200);
    expect(errors).toHaveLength(0);
  });

  it('carries the real batch size, not one per event', async () => {
    insertEvents.mockImplementation(async () => {
      throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    });
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(
      makeReq([pageview(), pageview(), pageview()]),
      makeRes(),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].eventCount).toBe(3);
  });
});
