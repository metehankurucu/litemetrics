import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnrichedEvent } from '@litemetrics/core';

const { insertEvents } = vi.hoisted(() => {
  const fn = vi.fn<(events: EnrichedEvent[]) => Promise<void>>(async () => {});
  return { insertEvents: fn };
});

vi.mock('./adapters/clickhouse', () => {
  class ClickHouseAdapter {
    constructor(_url: string) {}
    init = async () => {};
    insertEvents = insertEvents;
    query = async () => ({});
    queryTimeSeries = async () => ({});
    queryRetention = async () => ({});
    close = async () => {};
    listEvents = async () => ({});
    listUsers = async () => ({});
    getUserDetail = async () => null;
    getUserEvents = async () => ({});
    upsertIdentity = async () => {};
    getVisitorIdsForUser = async () => [];
    getUserIdForVisitor = async () => null;
    createSite = async () => ({});
    getSite = async () => null;
    getSiteBySecret = async () => null;
    listSites = async () => [];
    updateSite = async () => null;
    deleteSite = async () => false;
    regenerateSecret = async () => null;
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

describe('collector timestamp sanitization', () => {
  beforeEach(() => {
    insertEvents.mockClear();
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
