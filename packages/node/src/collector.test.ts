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
  getUserDetail,
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
  getUserDetail: vi.fn<(siteId: string, identifier: string, options?: { includeBots?: boolean }) => Promise<any>>(
    async () => null,
  ),
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
    getUserDetail = getUserDetail;
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
  getUserDetail.mockClear();
  getUserDetail.mockImplementation(async () => null);
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

  // A truncated Chrome UA - what a scraper sends when it copies only the platform
  // token - escapes isbot v5 AND leaves ua-parser with no browser and no engine, so
  // it is the realistic UA that drives the heuristic layer without mocking. The
  // standard-mode layer-2 and layer-3 cases live in their own describe block below.

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

// The bug this block exists to prevent: `standard` is the shipped default
// (`BOT_FILTER_MODE` unset -> `standard`) and it used to gate layers 2 and 3 off
// entirely, so `bot` could only ever be a signature hit, which is always dropped -
// making `bot_flag` a structural NULL and `queryBotStats` structurally empty. Every
// doc (README, self-hosting, packages/node/README, getting-started) promised the
// opposite: layer 1 drops, layers 2 and 3 flag.
describe('collector bot filtering - standard mode runs the non-signature layers', () => {
  beforeEach(() => {
    resetAdapterMocks();
  });

  // Truncated Chrome UA: escapes isbot v5, and ua-parser resolves neither a browser
  // nor an engine from it. With no Accept-Language and no Referer either, all four
  // heuristic signals are empty.
  const SCRUBBED_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  const REAL_CHROME_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const BROWSER_HEADERS = { 'accept-language': 'en-US,en;q=0.9', referer: 'https://x.test/prev' };

  function makeBotReq(ua: string, headers: Record<string, string> = {}, ip = '9.9.9.9') {
    return {
      method: 'POST',
      headers: { 'user-agent': ua, ...headers },
      body: {
        events: [{
          siteId: 'site_test', visitorId: 'v1', sessionId: 's1', type: 'pageview',
          name: '$pageview', timestamp: Date.now(), url: 'https://x.test/',
        }],
      },
      socket: { remoteAddress: ip },
    };
  }

  // R1 - the layer-2 half of the fix.
  it('flags but does not drop a heuristic hit in standard mode, persisting botFlag', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    await collector.handler()(makeBotReq(SCRUBBED_UA), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('heuristic');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'heuristic', reason: 'no-browser-signals', action: 'flagged', mode: 'standard',
      }),
    );
  });

  // R2 - the layer-3 half of the fix.
  it('flags but does not drop a rate-limit overflow in standard mode, persisting botFlag', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS), makeRes());
    expect(onBotDetected).not.toHaveBeenCalled();
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBe('rate-limit');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', reason: 'rate-limit', action: 'flagged' }),
    );
  });

  // R4 - the one enforcing layer must stay enforcing. A signature hit is still a drop,
  // not a flag, even though the layers behind it now run.
  it('still drops a signature hit in standard mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    await collector.handler()(makeBotReq('curl/8.0.0'), makeRes());
    expect(insertEvents).not.toHaveBeenCalled();
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'signature', action: 'dropped', mode: 'standard' }),
    );
  });

  // R5 - the short-circuit the else-if chain always had: a heuristic hit returns before
  // rateLimiter.check, so a bot never eats a legitimate visitor's rate-limit slot on a
  // shared NAT. maxEvents is 1, so if the scrubbed request had consumed the slot the
  // real browser behind the same IP would come back rate-limited.
  it('a heuristic hit consumes no rate-limit slot', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq(SCRUBBED_UA), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).toHaveBeenCalledTimes(1);
  });

  // R4 - a dropped signature hit must not consume a slot either.
  it('a dropped signature hit consumes no rate-limit slot', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1 },
    });
    const handler = collector.handler();
    await handler(makeBotReq('curl/8.0.0'), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
  });

  // R4 - `off` still means off. Opening layers 2, 3 and 4 in standard must not leak into it.
  it('runs no layer at all in off mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'off', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeBotReq(SCRUBBED_UA), makeRes());
    await handler(makeBotReq(SCRUBBED_UA), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R4 - strict still DROPS what standard now flags. Same UA, opposite action.
  it('still drops the same heuristic hit in strict mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'strict', onBotDetected },
    });
    await collector.handler()(makeBotReq(SCRUBBED_UA), makeRes());
    expect(insertEvents).not.toHaveBeenCalled();
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'heuristic', action: 'dropped', mode: 'strict' }),
    );
  });

  // R4 - a per-site override still outranks the server default.
  it("honours site.botFilterMode='off' against a standard server default", async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web', botFilterMode: 'off',
    }));
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    await collector.handler()(makeBotReq(SCRUBBED_UA), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R6 - the flag is what makes the event countable by queryBotStats, so every event in
  // a flagged batch has to carry it, not just the first.
  it('marks every event of a flagged batch, not only the first', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard' },
    });
    const req = makeBotReq(SCRUBBED_UA);
    req.body.events.push({
      siteId: 'site_test', visitorId: 'v1', sessionId: 's1', type: 'pageview',
      name: '$pageview', timestamp: Date.now(), url: 'https://x.test/two',
    });
    await collector.handler()(req, makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    const events = insertEvents.mock.calls[0]![0];
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.botFlag)).toEqual(['heuristic', 'heuristic']);
  });

  // R22 - the layer-3 key is caller-supplied header text under the default `trustProxy`,
  // and it is retained as a Map key until eviction. An implausible one is not keyed on:
  // the request falls back to the socket address, so 16 KB of header cannot become 16 KB
  // of retained key. Rejected rather than truncated, or two callers would share a window.
  it('does not key the rate limiter on an oversized X-Forwarded-For', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    const oversized = '1.2.3.'.repeat(2000);

    await handler(makeBotReq(REAL_CHROME_UA, { ...BROWSER_HEADERS, 'x-forwarded-for': oversized }), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, { ...BROWSER_HEADERS, 'x-forwarded-for': oversized }), makeRes());

    // The second call is rate-limited, which can only happen if both were keyed on the
    // same fallback address rather than on the header.
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', ip: '9.9.9.9' }),
    );
    expect(onBotDetected.mock.calls.every(([info]) => info.ip.length <= 45)).toBe(true);
  });

  // R22 - the boundary from the other side: a real forwarded address is still honoured,
  // so the guard cannot quietly turn `trustProxy` off.
  it('still keys on a plausible X-Forwarded-For', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    const headers = { ...BROWSER_HEADERS, 'x-forwarded-for': '203.0.113.9, 10.0.0.1' };

    await handler(makeBotReq(REAL_CHROME_UA, headers), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, headers), makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', ip: '203.0.113.9' }),
    );
  });

  // R22 - `x-real-ip` is trimmed like the forwarded header, so one client's padded and
  // unpadded headers do not become two retained windows.
  it('trims x-real-ip so padding does not buy a second window', async () => {
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();

    await handler(makeBotReq(REAL_CHROME_UA, { ...BROWSER_HEADERS, 'x-real-ip': '203.0.113.5' }), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, { ...BROWSER_HEADERS, 'x-real-ip': '  203.0.113.5  ' }), makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', ip: '203.0.113.5' }),
    );
  });

  // R2 - the window is per IP, so one noisy IP must not flag a different visitor.
  it('rate-limits per IP, not globally', async () => {
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1 },
    });
    const handler = collector.handler();
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS, '1.1.1.1'), makeRes());
    await handler(makeBotReq(REAL_CHROME_UA, BROWSER_HEADERS, '2.2.2.2'), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBeUndefined();
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

  // R3 (review round 6) - main required this ("R3: standard mode never ran the rate-limit
  // layer and must not start now"), #25 flipped it, and this review restores it: an
  // app SDK batches on a 5s timer (up to 12 requests/min per device) and the per-IP
  // window is shared by every device behind one carrier CGNAT address. About 5 active
  // devices sharing an address would have been enough to hit the 60/min default and
  // hide real users' events in the default reports. `standard` relies on layer 4
  // alone on app sites; `strict` and `shadow` still consult the per-IP layer.
  it('does not run the per-IP layer on app sites in standard mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R3 (review round 6) - `shadow` is not `standard`: it still consults the per-IP layer on
  // app sites, same as `strict` above.
  it('still flags an app-site rate-limit overflow in shadow mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'shadow', rateLimitMaxEvents: 1, onBotDetected },
    });
    const handler = collector.handler();
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    await handler(makeReqFor('okhttp/4.12.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledTimes(2);
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(insertEvents.mock.calls[1]![0][0]!.botFlag).toBe('rate-limit');
  });

  // R3: layers 1 and 2 stay off on an app site in standard mode. A React Native
  // request carries no browser, no engine, no Accept-Language and no Referer, so an
  // ungated heuristic layer would flag 100% of app traffic.
  it('does not let layers 1 or 2 flag app traffic in standard mode', async () => {
    getSite.mockImplementation(async () => appSite());
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    await collector.handler()(makeReqFor('MyApp/1.0 CFNetwork/1498.700.2 Darwin/23.6.0'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).not.toHaveBeenCalled();
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

  // The cost of a mis-typed site changed with this fix, so it is pinned rather than
  // left to be discovered. The RN SDK sends its own `litemetrics-react-native/<v>
  // (<platform>)` User-Agent (packages/react-native/src/user-agent.ts) precisely so
  // isbot's bare-token rule stops matching it - but ua-parser resolves neither a
  // browser nor an engine from it, and an Android SDK request carries no Accept-Language
  // and no Referer (OkHttp adds neither), so on a site that is NOT typed `app` the
  // heuristic layer now fires. iOS is not pinned here: NSURLSession may add
  // Accept-Language.
  //
  // Before this change `standard` never ran that layer, so the events were counted as
  // real traffic. They are now stored with `bot_flag` and hidden from the default
  // query. That is the documented rule applied consistently ("otherwise it is still
  // filtered as browser traffic"), not a bypass: acting on the payload's `mobile`
  // field would hand every caller a way to opt out of the filter with one JSON key.
  // The fix is one API call, and the server already logs `[site-type-mismatch]`.
  it('flags RN SDK traffic on a non-app site in standard mode, and does not drop it', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test', secretKey: 'k', type: 'web',
    }));
    const onSiteTypeMismatch = vi.fn();
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onSiteTypeMismatch, onBotDetected },
    });
    await collector.handler()(makeMobileReq('litemetrics-react-native/0.9.0 (android)'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('heuristic');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'heuristic', action: 'flagged', mode: 'standard' }),
    );
    expect(onSiteTypeMismatch).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site_test', siteType: 'web', platform: 'android' }),
    );
  });

  // The remedy for the case above, pinned as the contrast: typing the site `app` is
  // what makes the SDK's traffic count again. Same request, same mode, no flag.
  it('stores the same RN SDK request unflagged once the site is typed app', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test App', secretKey: 'k', type: 'app',
    }));
    const onBotDetected = vi.fn();
    const collector = await createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', onBotDetected },
    });
    await collector.handler()(makeMobileReq('litemetrics-react-native/0.9.0 (android)'), makeRes());
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    expect(onBotDetected).not.toHaveBeenCalled();
  });

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

  it("getUserDetail: ?includeBots=true reaches adapter", async () => {
    const collector = await makeAuthedCollector();
    await collector.usersHandler()(makeAuthedGet('/api/users/visitor-abc?siteId=site_test&includeBots=true'), makeRes());
    expect(getUserDetail).toHaveBeenCalledWith('site_test', 'visitor-abc', { includeBots: true });
  });

  it("getUserDetail: missing includeBots reaches adapter as false", async () => {
    const collector = await makeAuthedCollector();
    await collector.usersHandler()(makeAuthedGet('/api/users/visitor-abc?siteId=site_test'), makeRes());
    expect(getUserDetail).toHaveBeenCalledWith('site_test', 'visitor-abc', { includeBots: false });
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

  it('redacts long driver credentials before the callback message is truncated', async () => {
    insertEvents.mockRejectedValueOnce(
      new Error(`postgres://lm_user:${'secret'.repeat(200)}@db.internal:5432/lm`),
    );
    const errors: CollectErrorInfo[] = [];
    const collector = await collectorWith((info) => errors.push(info));

    await collector.handler()(makeReq([pageview()]), makeRes());

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('postgres://***@db.internal:5432/lm');
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

// Layer 4 - visitor velocity. The three layers in front of it all read a single request:
// layer 1 matches the User-Agent string, layer 2 reads UA + Accept-Language + Referer,
// layer 3 counts CALLS per IP ("a batch of 100 events spends a single slot"). None of
// them looks at what one visitor does over time, which is exactly the shape of the traffic
// that was being counted as real: BeJudge web, 30 days to Sep 2026, 5032 of 5382 pageviews
// (93.5%) from ONE visitorId at 20-71 pages per second, CN-origin, browser-shaped UA with
// Accept-Language and Referer both present.
describe('collector bot filtering - layer 4: visitor velocity', () => {
  beforeEach(() => {
    resetAdapterMocks();
    // The recorded traffic hit a REGISTERED site, and layer 4 only ever keys a window on
    // a site the adapter resolved (R11), so the fixture has to resolve one. Echoing the
    // requested id is what a real adapter does: it returns the row stored under that id.
    getSite.mockImplementation(async (siteId: string) => ({
      siteId, name: 'Test Site', secretKey: 'sk_test', type: 'web',
    }));
  });

  const REAL_CHROME_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  // Every header a real browser sends, because the recorded traffic sent them too. This
  // fixture must clear layers 1 and 2 or it would be proving the wrong layer.
  const BROWSER_HEADERS = { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', referer: 'https://bejudge.test/' };

  /** One collect request: `pageviews` pageviews plus `events` custom events, one visitor. */
  function makeBatch(opts: {
    visitorId?: string;
    pageviews?: number;
    events?: number;
    ip?: string;
    ua?: string;
    headers?: Record<string, string>;
  } = {}) {
    const visitorId = opts.visitorId === undefined ? 'v_bejudge' : opts.visitorId;
    const body: { events: Record<string, unknown>[] } = { events: [] };
    for (let i = 0; i < (opts.pageviews ?? 0); i++) {
      body.events.push({
        siteId: 'site_test', visitorId, sessionId: 's1', type: 'pageview',
        name: '$pageview', timestamp: Date.now(), url: `https://bejudge.test/p/${i}`,
      });
    }
    for (let i = 0; i < (opts.events ?? 0); i++) {
      body.events.push({
        siteId: 'site_test', visitorId, sessionId: 's1', type: 'event',
        name: 'rage_click', eventSubtype: 'rage_click', timestamp: Date.now(),
      });
    }
    return {
      method: 'POST',
      headers: { 'user-agent': opts.ua ?? REAL_CHROME_UA, ...(opts.headers ?? BROWSER_HEADERS) },
      body,
      socket: { remoteAddress: opts.ip ?? '203.0.113.7' },
    };
  }

  async function velocityCollector(extra: Record<string, unknown> = {}) {
    return createCollector({
      db: { adapter: 'clickhouse', url: 'http://x' },
      botFilter: { defaultMode: 'standard', ...extra },
    });
  }

  /** Every botFlag written across every insertEvents call, flattened. */
  function writtenFlags(): Array<string | undefined> {
    return insertEvents.mock.calls.flatMap((call) => call[0].map((e) => e.botFlag));
  }

  // R1 + R7 - the missed case, reproduced. 71 pageviews per second from one visitorId,
  // arriving the way the tracker actually ships them (batches of 10, DEFAULT_BATCH_SIZE).
  // Under `standard` this is flagged, never dropped.
  it('flags the BeJudge burst: one visitorId at 71 pageviews per second', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    const handler = collector.handler();

    // 71 pageviews inside one second = 8 batches of 10 (the last one short).
    for (let i = 0; i < 8; i++) {
      await handler(makeBatch({ pageviews: i === 7 ? 1 : 10 }), makeRes());
    }

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'velocity', reason: 'velocity', action: 'flagged', mode: 'standard',
      }),
    );
    // Flagged, not dropped: every one of the 71 pageviews is still stored.
    expect(writtenFlags()).toHaveLength(71);
    // Exact, not "more than zero": the first 60 fill the window and go through
    // unflagged, so batches 7 and 8 (10 + 1 pageviews) are the flagged ones. That
    // number is the per-window leak rate an operator will ask about.
    expect(writtenFlags().filter((f) => f === 'velocity')).toHaveLength(11);
  });

  // R9 - the other direction. A real person browsing fast: 20 pageviews inside the window,
  // same visitorId, same headers. Below the threshold, so nothing is flagged at all.
  it('does not flag a real visitor browsing under the threshold', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    const handler = collector.handler();

    for (let i = 0; i < 20; i++) {
      await handler(makeBatch({ visitorId: 'v_human', pageviews: 1 }), makeRes());
    }

    expect(insertEvents).toHaveBeenCalledTimes(20);
    expect(writtenFlags()).toEqual(Array(20).fill(undefined));
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R1 - the key is the visitor, not the IP. A second visitor behind the same address
  // (shared NAT, office, CGNAT) keeps counting clean while the first one is flagged.
  it('flags the noisy visitor and not a second visitor on the same IP', async () => {
    const collector = await velocityCollector();
    const handler = collector.handler();

    await handler(makeBatch({ visitorId: 'v_bot', pageviews: 61 }), makeRes());
    insertEvents.mockClear();
    await handler(makeBatch({ visitorId: 'v_human', pageviews: 1 }), makeRes());

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
  });

  // R4 - events, not requests. This is the batching escape the IP limiter cannot close:
  // one single call carrying 61 pageviews spends exactly one rate-limit slot, so layer 3
  // sees a quiet IP. Layer 4 counts the pageviews.
  it('counts pageviews, not collect calls: a single 61-pageview batch trips the layer', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 60 });
    await collector.handler()(makeBatch({ pageviews: 61 }), makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', reason: 'velocity' }),
    );
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0].every((e) => e.botFlag === 'velocity')).toBe(true);
  });

  // R4 + R9 - a rage-click or scroll-depth burst is dozens of events per minute BY DESIGN
  // (autoRageClicks, autoScrollDepth). Counting them would make the layer fire on the
  // tracker's own features, so only pageviews count.
  it('does not count custom events: 100 rage clicks from one visitor stay unflagged', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();

    for (let i = 0; i < 2; i++) {
      await handler(makeBatch({ pageviews: 0, events: 50 }), makeRes());
    }

    expect(writtenFlags()).toEqual(Array(100).fill(undefined));
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R7 - strict drops what standard flags. Same burst, opposite action.
  it('drops the same burst in strict mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ defaultMode: 'strict', onBotDetected });
    await collector.handler()(makeBatch({ pageviews: 61 }), makeRes());

    expect(insertEvents).not.toHaveBeenCalled();
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', action: 'dropped', mode: 'strict' }),
    );
  });

  // R7 - shadow flags without dropping, exactly like standard for this layer.
  it('flags without dropping in shadow mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ defaultMode: 'shadow', onBotDetected });
    await collector.handler()(makeBatch({ pageviews: 61 }), makeRes());

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', action: 'flagged', mode: 'shadow' }),
    );
  });

  // R7 - `off` means off for layer 4 too.
  it('runs no velocity check in off mode', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ defaultMode: 'off', onBotDetected });
    await collector.handler()(makeBatch({ pageviews: 100 }), makeRes());

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(writtenFlags().every((f) => f === undefined)).toBe(true);
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R5 - CORRECTED. A velocity hit DOES spend the per-IP slot, because unlike a layer-1 or
  // layer-2 hit it does not return the request: the batch's other visitors are stored, and
  // in `standard` they are stored unflagged and visible in every report. Skipping the
  // per-IP window for such a request let a client buy immunity from layer 3 outright, by
  // keeping one burner visitorId over the line and rotating fresh ids for the rest of the
  // batch. maxEvents is 1, so the second request from that address comes back rate-limited.
  it('a velocity hit spends the IP rate-limit slot, because its request still stores rows', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ rateLimitMaxEvents: 1, onBotDetected });
    const handler = collector.handler();

    await handler(makeBatch({ visitorId: 'v_bot', pageviews: 61 }), makeRes());
    insertEvents.mockClear();
    await handler(makeBatch({ visitorId: 'v_human', pageviews: 1 }), makeRes());

    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('rate-limit');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'rate-limit', reason: 'rate-limit' }),
    );
  });

  // R5 - the attack that correction closes, driven end to end. One burner visitor is held
  // over the line so layer 4 fires on every call; before the fix that skipped layer 3
  // entirely and the batch's OTHER visitors were stored clean, without limit. Now the
  // address runs out of budget and the bystanders carry a flag.
  it('does not let a permanent velocity hit smuggle unlimited clean rows past layer 3', async () => {
    const collector = await velocityCollector({
      visitorVelocityMaxPageviews: 2, rateLimitMaxEvents: 2,
    });
    const handler = collector.handler();

    // Requests 1-2 put `v_burner` over its own line and spend the address's two slots.
    await handler(makeMixedBatch([['v_burner', 3]]), makeRes());
    await handler(makeMixedBatch([['v_burner', 1], ['v_fresh_a', 1]]), makeRes());
    insertEvents.mockClear();

    // Request 3: the address is out of budget, so layer 3 answers before layer 4 is even
    // asked, and the fresh visitor is no longer stored clean.
    await handler(makeMixedBatch([['v_burner', 1], ['v_fresh_b', 1]]), makeRes());
    const stored = insertEvents.mock.calls[0]![0];
    expect(stored).toHaveLength(2);
    expect(stored.every((e) => e.botFlag !== undefined)).toBe(true);
    expect(stored.find((e) => e.visitorId === 'v_fresh_b')!.botFlag).toBe('rate-limit');
  });

  // R5 - order. A layer-2 hit short-circuits before the velocity counter, so a scrubbed-UA
  // bot cannot silently fill a visitor's velocity window; the reported layer stays the
  // more specific one.
  it('reports the heuristic layer, not velocity, when both would fire', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    // Scrubbed UA with no Accept-Language and no Referer: layer 2 fires.
    await collector.handler()(
      makeBatch({ pageviews: 61, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', headers: {} }),
      makeRes(),
    );

    expect(onBotDetected).toHaveBeenCalledTimes(1);
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'heuristic' }),
    );
  });

  // R6 - app sites. Layers 1 and 2 are browser heuristics and stay off there (PR #12), but
  // velocity is a volume signal: an app site id being replayed is exactly this shape.
  it('runs on an app-type site, where layers 1 and 2 do not', async () => {
    getSite.mockImplementation(async () => ({
      siteId: 'site_test', name: 'Test App', secretKey: 'k', type: 'app',
    }));
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    await collector.handler()(
      makeBatch({ pageviews: 61, ua: 'litemetrics-react-native/0.9.0 (android)', headers: {} }),
      makeRes(),
    );

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', action: 'flagged' }),
    );
  });

  // R2 - the shipped threshold, pinned from both sides with no config in the test. 60 is
  // where it is because 30 is exactly where a legitimate pattern sits: autoSpa is on by
  // default and AutoTracker de-dupes on the full href, so a UI that mirrors its state into
  // the URL emits one pageview per URL write, and an average 180-CPM typist in such a field
  // produces three a second.
  it('lets 60 pageviews through and flags the 61st, on the shipped default', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    const handler = collector.handler();

    await handler(makeBatch({ pageviews: 60 }), makeRes());
    expect(writtenFlags()).toEqual(Array(60).fill(undefined));
    expect(onBotDetected).not.toHaveBeenCalled();

    insertEvents.mockClear();
    await handler(makeBatch({ pageviews: 1 }), makeRes());
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');
  });

  // R3 - the key cap is reachable from config, and evicting a window really does clear it.
  // That is the shape of the attack the cap exists for: a client with rotating visitor ids
  // evicts real visitors' windows, and the layer goes quiet for everyone in that process.
  it('honours visitorVelocityMaxKeys and starts a window over after eviction', async () => {
    const collector = await velocityCollector({
      visitorVelocityMaxPageviews: 1,
      visitorVelocityMaxKeys: 2,
      rateLimitMaxEvents: 1000,
    });
    const handler = collector.handler();

    // v1 is over its limit and stays flagged while its window is still tracked.
    await handler(makeBatch({ visitorId: 'v1', pageviews: 2 }), makeRes());
    insertEvents.mockClear();
    await handler(makeBatch({ visitorId: 'v1', pageviews: 1 }), makeRes());
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

    // Two fresh visitors push v1 out of a two-key cap.
    await handler(makeBatch({ visitorId: 'v2', pageviews: 1 }), makeRes());
    await handler(makeBatch({ visitorId: 'v3', pageviews: 1 }), makeRes());

    insertEvents.mockClear();
    await handler(makeBatch({ visitorId: 'v1', pageviews: 1 }), makeRes());
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
  });

  // R2 - the escape valve. An operator who hits a false positive can turn the layer off
  // without turning the whole bot filter off.
  it('is disabled by visitorVelocityMaxPageviews: 0', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ visitorVelocityMaxPageviews: 0, onBotDetected });
    await collector.handler()(makeBatch({ pageviews: 100 }), makeRes());

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(writtenFlags().every((f) => f === undefined)).toBe(true);
    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R2 - and it is tunable in the other direction.
  it('honours a lowered visitorVelocityMaxPageviews', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ visitorVelocityMaxPageviews: 2, onBotDetected });
    const handler = collector.handler();
    await handler(makeBatch({ pageviews: 2 }), makeRes());
    expect(onBotDetected).not.toHaveBeenCalled();
    await handler(makeBatch({ pageviews: 1 }), makeRes());
    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity' }),
    );
  });

  // R4 - a missing or blank visitorId must not bucket unrelated traffic together under one
  // empty key, which would flag every anonymous event once the shared bucket overflowed.
  it('does not count events whose visitorId is missing or blank', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();
    // Each half has to clear the threshold ON ITS OWN, or dropping `.trim()` would go
    // unnoticed: whitespace would get its own key and simply never fill it.
    await handler(makeBatch({ visitorId: '', pageviews: 100 }), makeRes());
    await handler(makeBatch({ visitorId: '   ', pageviews: 100 }), makeRes());
    await handler(makeBatch({ visitorId: '\t\n ', pageviews: 100 }), makeRes());

    expect(onBotDetected).not.toHaveBeenCalled();
  });

  // R4 - `visitorId` is attacker-controlled, unvalidated, and `parseBody` reads a
  // non-JSON body with no size cap, so a Map key built from it is unbounded unless the
  // length is checked. The key count cap does not help: the attack makes keys BIG, not
  // numerous. Skipped rather than truncated, so a flood cannot ride in on a real
  // visitor's window by sharing a prefix.
  it('never keys a window on a visitorId longer than 128 characters', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();

    const oversized = 'v'.repeat(129);
    for (let i = 0; i < 3; i++) {
      await handler(makeBatch({ visitorId: oversized, pageviews: 100 }), makeRes());
    }

    // 300 pageviews from one id, five times over the threshold, and nothing fires:
    // the key was never stored, so it cannot be retained either.
    expect(onBotDetected).not.toHaveBeenCalled();
    expect(writtenFlags().every((f) => f === undefined)).toBe(true);
  });

  // R4 - and the boundary holds from the other side, so the guard cannot quietly
  // tighten into rejecting ids the SDKs actually emit.
  it('still keys a window on a visitorId of exactly 128 characters', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    await collector.handler()(
      makeBatch({ visitorId: 'v'.repeat(128), pageviews: 61 }),
      makeRes(),
    );

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', reason: 'velocity' }),
    );
  });

  // R2 - the window is sliding, so a flagged visitor is not flagged forever: once the old
  // pageviews age out, the same visitor comes back clean. Configured nowhere in this test,
  // so it also pins the shipped default window of 10s: at 9.999s the burst still counts,
  // at 10.001s it has drained.
  it('stops flagging once the default 10s window drains, and not before', async () => {
    const base = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      const collector = await velocityCollector();
      const handler = collector.handler();

      await handler(makeBatch({ pageviews: 61 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

      nowSpy.mockReturnValue(base + 9_999);
      insertEvents.mockClear();
      await handler(makeBatch({ pageviews: 1 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

      nowSpy.mockReturnValue(base + 10_001);
      insertEvents.mockClear();
      await handler(makeBatch({ pageviews: 1 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });

  // R2 (review round 6) - the drain test above pins the sliding window for a burst that stops.
  // This one pins the opposite case: a flood that never slows must not refill the window
  // it is currently failing, or a visitor over the line would get 60 clean pageviews in
  // every window for as long as it kept flooding.
  it('keeps flagging a flood that never slows, and clears one window after it stops', async () => {
    const base = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      const collector = await velocityCollector();
      const handler = collector.handler();

      await handler(makeBatch({ pageviews: 61 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

      nowSpy.mockReturnValue(base + 5_000);
      insertEvents.mockClear();
      await handler(makeBatch({ pageviews: 61 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

      // On the old code this was `undefined`, because the window had drained: a limited
      // call left no trace, so the visitor refilled its budget while still flooding.
      nowSpy.mockReturnValue(base + 10_500);
      insertEvents.mockClear();
      await handler(makeBatch({ pageviews: 1 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');

      // A full window with no further pageviews at all: the visitor clears.
      nowSpy.mockReturnValue(base + 20_501);
      insertEvents.mockClear();
      await handler(makeBatch({ pageviews: 1 }), makeRes());
      expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });

  /** One collect request carrying pageviews for several visitors, in order. */
  function makeMixedBatch(spec: Array<[string, number]>) {
    const req = makeBatch({ pageviews: 0 });
    for (const [visitorId, count] of spec) {
      for (let i = 0; i < count; i++) {
        req.body.events.push({
          siteId: 'site_test', visitorId, sessionId: 's1', type: 'pageview',
          name: '$pageview', timestamp: Date.now(), url: `https://bejudge.test/${visitorId}/${i}`,
        });
      }
    }
    return req;
  }

  // R4 - the loop must not stop at the first overflow. A proxy that forwards several
  // visitors in one call would otherwise leave everyone after the noisy visitor
  // uncounted, so their own window would never fill and the layer would be blind to them.
  it('counts every visitor in a mixed batch, not only up to the first overflow', async () => {
    const collector = await velocityCollector({ visitorVelocityMaxPageviews: 2 });
    const handler = collector.handler();

    // v_loud overflows on its third pageview; v_quiet's two must still be recorded.
    await handler(makeMixedBatch([['v_loud', 3], ['v_quiet', 2]]), makeRes());
    insertEvents.mockClear();

    // v_quiet is now at 2 of 2, so this third one trips its own window.
    await handler(makeMixedBatch([['v_quiet', 1]]), makeRes());
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBe('velocity');
  });

  // R15 - the flag follows the VISITOR, not the request. Layers 1-3 judge a request and
  // have nothing finer to aim at; layer 4 measured one visitor, so flagging its batch-mates
  // would hide the pageviews of a bystander whose only mistake was sharing a call with a
  // noisy visitor. The previous revision flagged the whole batch and pinned that here.
  it('flags only the overflowing visitor in a mixed batch', async () => {
    const collector = await velocityCollector({ visitorVelocityMaxPageviews: 2 });
    await collector.handler()(makeMixedBatch([['v_loud', 5], ['v_quiet', 1]]), makeRes());

    const events = insertEvents.mock.calls[0]![0];
    expect(events).toHaveLength(6);
    expect(events.filter((e) => e.botFlag === 'velocity')).toHaveLength(5);
    expect(events.filter((e) => e.visitorId === 'v_loud').every((e) => e.botFlag === 'velocity')).toBe(true);
    expect(events.filter((e) => e.visitorId === 'v_quiet').every((e) => e.botFlag === undefined)).toBe(true);
  });

  // R15 - and the same rule in the direction that destroys data. `strict` drops, so a
  // per-request drop would throw away the bystander's pageviews outright rather than
  // merely hiding them.
  it('drops only the overflowing visitor in a mixed batch under strict', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({
      defaultMode: 'strict', visitorVelocityMaxPageviews: 2, onBotDetected,
    });
    await collector.handler()(makeMixedBatch([['v_loud', 5], ['v_quiet', 1]]), makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', action: 'dropped', mode: 'strict' }),
    );
    expect(insertEvents).toHaveBeenCalledOnce();
    const events = insertEvents.mock.calls[0]![0];
    expect(events).toHaveLength(1);
    expect(events[0]!.visitorId).toBe('v_quiet');
    // Stored clean, not stored flagged: nothing about this visitor tripped the layer.
    expect(events[0]!.botFlag).toBeUndefined();
  });

  // R11 - the P0 of round 3, from the other half of the key. `siteId` is unvalidated
  // request-body text with no length cap of its own, and the hostname filter at
  // `collector.ts` is written `if (site?.allowedOrigins ...)`, so an unknown site skips it
  // entirely and reaches this layer. Layer 4 now takes the gate `reportedTypeMismatches`
  // already has: no resolved site, no window.
  it('never keys a window on a siteId that resolves to no site', async () => {
    getSite.mockImplementation(async () => null);
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();

    for (let i = 0; i < 3; i++) {
      await handler(makeBatch({ pageviews: 100 }), makeRes());
    }

    // 300 pageviews, five times over the threshold, and the layer never fires: nothing
    // was keyed, so nothing was retained either.
    expect(onBotDetected).not.toHaveBeenCalled();
    expect(writtenFlags()).toHaveLength(300);
    expect(writtenFlags().every((f) => f === undefined)).toBe(true);
  });

  // R11 - the other side of the same guard, so it cannot pass by switching the layer off:
  // once a site resolves, the window is keyed on a HASH of the pair, so even an adapter
  // that returns a huge site id costs a fixed 64 characters instead of its own length.
  it('still flags on a resolved site whose id is long', async () => {
    getSite.mockImplementation(async (siteId: string) => ({
      siteId, name: 'Long', secretKey: 'sk_test', type: 'web',
    }));
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected });
    const req = makeBatch({ pageviews: 61 });
    const longSiteId = `site_${'x'.repeat(5000)}`;
    for (const event of req.body.events) event.siteId = longSiteId;

    await collector.handler()(req, makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', siteId: longSiteId }),
    );
  });

  // R14 - `server` is the sentinel that `track()` and `identify()` stamp on programmatic
  // events, and `processIdentity` already skips it. A host that forwards its server-side
  // events through /api/collect would otherwise pool every one of them into a single
  // window and flag them all once that shared bucket overflowed.
  it("never keys a window on the 'server' sentinel visitorId", async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();

    for (let i = 0; i < 3; i++) {
      await handler(makeBatch({ visitorId: 'server', pageviews: 100 }), makeRes());
    }

    expect(onBotDetected).not.toHaveBeenCalled();
    expect(writtenFlags()).toHaveLength(300);
    expect(writtenFlags().every((f) => f === undefined)).toBe(true);
  });

  // R13 - the honest limit of the key, pinned so the documentation cannot drift off it.
  // `visitorId` is not a person: the browser tracker derives it from
  // `hostname|day|UA|language|timezone|screen` (`packages/tracker/src/session.ts`), and
  // four of those six carry no cross-visitor entropy. Two people on the same office build,
  // locale and screen size therefore send the SAME id from two addresses and share one
  // window. The key does not pool a shared NAT; it can still pool the people behind it.
  it('pools two people that the tracker gives one fingerprint id', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({ onBotDetected, rateLimitMaxEvents: 1000 });
    const handler = collector.handler();
    // 16 lowercase hex characters: the shape `hash.slice(0, 16)` actually emits.
    const shared = '9f4b2c7d1e0a5836';

    // 31 pageviews each, from two addresses. Neither person is near the threshold alone.
    for (let i = 0; i < 31; i++) {
      await handler(makeBatch({ visitorId: shared, pageviews: 1, ip: '198.51.100.11' }), makeRes());
      await handler(makeBatch({ visitorId: shared, pageviews: 1, ip: '203.0.113.22' }), makeRes());
    }

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', reason: 'velocity' }),
    );
    expect(writtenFlags().filter((f) => f === 'velocity').length).toBeGreaterThan(0);
  });

  // R15 - the events of an over-limit visitor go together, whatever their type. Only
  // pageviews COUNT toward the window, which is not the same as saying only pageviews are
  // acted on: once a visitor is judged too fast, its conversions and rage clicks in that
  // same batch are its events too. Pinned because the docs used to say only the first half.
  it("acts on an over-limit visitor's custom events too, not only its pageviews", async () => {
    const collector = await velocityCollector({ rateLimitMaxEvents: 1000 });
    await collector.handler()(makeBatch({ pageviews: 61, events: 3 }), makeRes());

    const stored = insertEvents.mock.calls[0]![0];
    expect(stored).toHaveLength(64);
    expect(stored.every((e) => e.botFlag === 'velocity')).toBe(true);
  });

  it("drops an over-limit visitor's custom events too, under strict", async () => {
    const collector = await velocityCollector({ defaultMode: 'strict', rateLimitMaxEvents: 1000 });
    await collector.handler()(makeBatch({ pageviews: 61, events: 3 }), makeRes());

    expect(insertEvents).not.toHaveBeenCalled();
  });

  // R14 - the window key is the TRIMMED id, so surrounding whitespace does not buy a
  // second budget. The stored row keeps the raw string, so the two are still two rows.
  it('treats a whitespace-padded visitorId as the same window', async () => {
    const collector = await velocityCollector({ rateLimitMaxEvents: 1000 });
    const handler = collector.handler();

    await handler(makeBatch({ visitorId: 'v_pad', pageviews: 60 }), makeRes());
    insertEvents.mockClear();
    await handler(makeBatch({ visitorId: '  v_pad  ', pageviews: 1 }), makeRes());

    const stored = insertEvents.mock.calls[0]![0];
    expect(stored[0]!.botFlag).toBe('velocity');
    // The row is stored as it was sent; only the window key is trimmed.
    expect(stored[0]!.visitorId).toBe('  v_pad  ');
  });

  // R21 - `onBotDetected` says how much of the batch its action covered. Without it, a
  // partial velocity drop is reported exactly like a whole-request drop, and the host's
  // `bot_dropped=` counter inherits the error.
  it('reports how many events the action covered, not the batch size', async () => {
    const onBotDetected = vi.fn();
    const collector = await velocityCollector({
      defaultMode: 'strict', visitorVelocityMaxPageviews: 2, onBotDetected,
    });
    await collector.handler()(makeMixedBatch([['v_loud', 5], ['v_quiet', 1]]), makeRes());

    expect(onBotDetected).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'velocity', action: 'dropped', events: 5 }),
    );
  });

  // R1 - the layer is per site as well as per visitor: the same visitorId string on a
  // different site id keeps its own budget.
  it('keys the window per site, not only per visitor', async () => {
    const collector = await velocityCollector();
    const handler = collector.handler();

    await handler(makeBatch({ pageviews: 61 }), makeRes());
    insertEvents.mockClear();
    const other = makeBatch({ pageviews: 1 });
    other.body.events[0]!.siteId = 'site_other';
    await handler(other, makeRes());

    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0]![0][0]!.botFlag).toBeUndefined();
  });
});
