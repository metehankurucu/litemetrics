import { describe, it, expect, vi } from 'vitest';
import { PostgresAdapter } from './postgres';
import { ClickHouseAdapter } from './clickhouse';
import { MongoDBAdapter } from './mongodb';

/**
 * DB-free guard: getUserDetail's merged-detail query must honour the bot
 * filter, like every other reader (query, queryTimeSeries, listEvents,
 * listUsers, ...). Each case stubs the adapter's I/O member directly
 * (pool / queryRows / collection) so nothing touches the network.
 */

const PG_ROW = {
  visitor_id: 'v1',
  first_seen: '2026-01-01T00:00:00.000Z',
  last_seen: '2026-01-02T00:00:00.000Z',
  total_events: '1',
  total_pageviews: '1',
  total_sessions: '1',
};

const CH_ROW = {
  last_visitor_id: 'v1',
  firstSeen: '2026-01-01 00:00:00.000',
  lastSeen: '2026-01-02 00:00:00.000',
  totalEvents: '1',
  totalPageviews: '1',
  totalSessions: '1',
};

const MONGO_ROW = {
  visitorIds: ['v1'],
  firstSeen: new Date('2026-01-01T00:00:00Z'),
  lastSeen: new Date('2026-01-02T00:00:00Z'),
  totalEvents: 1,
  totalPageviews: 1,
  sessions: ['s1'],
};

describe('PostgresAdapter.getUserDetail bot filter', () => {
  it('default mode excludes bot-flagged rows from the merged-detail query', async () => {
    const adapter = new PostgresAdapter('postgres://u:p@127.0.0.1:1/x');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [PG_ROW] }));
    (adapter as any).pool = { query };

    await adapter.getUserDetail('site_1', 'user-1');

    const call = query.mock.calls.find((c) => String(c[0]).includes('first_seen'));
    expect(call).toBeDefined();
    expect(String(call![0])).toContain('bot_flag IS NULL');
  });

  it('includeBots: true does not filter bot-flagged rows out of the merged-detail query', async () => {
    const adapter = new PostgresAdapter('postgres://u:p@127.0.0.1:1/x');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [PG_ROW] }));
    (adapter as any).pool = { query };

    await adapter.getUserDetail('site_1', 'user-1', { includeBots: true });

    const call = query.mock.calls.find((c) => String(c[0]).includes('first_seen'));
    expect(call).toBeDefined();
    expect(String(call![0])).not.toContain('bot_flag');
  });

  it('anonymous-visitor fallback forwards includeBots to listUsers', async () => {
    const adapter = new PostgresAdapter('postgres://u:p@127.0.0.1:1/x');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue([]);
    vi.spyOn(adapter as any, 'getUserIdForVisitor').mockResolvedValue(null);
    const listUsers = vi.spyOn(adapter, 'listUsers').mockResolvedValue({ users: [], total: 0 } as any);

    await adapter.getUserDetail('site_1', 'v9', { includeBots: true });

    expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ includeBots: true }));
  });
});

describe('ClickHouseAdapter.getUserDetail bot filter', () => {
  it('default mode excludes bot-flagged rows from the merged-detail query', async () => {
    const adapter = new ClickHouseAdapter('http://127.0.0.1:1');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    vi.spyOn(adapter as any, 'getUserIdForVisitor').mockResolvedValue(null);
    const queryRows = vi.spyOn(adapter as any, 'queryRows').mockResolvedValue([CH_ROW]);

    await adapter.getUserDetail('site_1', 'user-1');

    expect(String(queryRows.mock.calls[0]![0])).toContain('bot_flag IS NULL');
  });

  it('includeBots: true does not filter bot-flagged rows out of the merged-detail query', async () => {
    const adapter = new ClickHouseAdapter('http://127.0.0.1:1');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    vi.spyOn(adapter as any, 'getUserIdForVisitor').mockResolvedValue(null);
    const queryRows = vi.spyOn(adapter as any, 'queryRows').mockResolvedValue([CH_ROW]);

    await adapter.getUserDetail('site_1', 'user-1', { includeBots: true });

    expect(String(queryRows.mock.calls[0]![0])).not.toContain('bot_flag');
  });

  it('anonymous-visitor fallback forwards includeBots to listUsers', async () => {
    const adapter = new ClickHouseAdapter('http://127.0.0.1:1');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue([]);
    vi.spyOn(adapter as any, 'getUserIdForVisitor').mockResolvedValue(null);
    const listUsers = vi.spyOn(adapter, 'listUsers').mockResolvedValue({ users: [], total: 0 } as any);

    await adapter.getUserDetail('site_1', 'v9', { includeBots: true });

    expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ includeBots: true }));
  });

  it('an all-filtered aggregate (zero events) resolves null, not a zero row', async () => {
    const adapter = new ClickHouseAdapter('http://127.0.0.1:1');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    vi.spyOn(adapter as any, 'getUserIdForVisitor').mockResolvedValue(null);
    vi.spyOn(adapter as any, 'queryRows').mockResolvedValue([{ ...CH_ROW, totalEvents: 0 }]);

    const result = await adapter.getUserDetail('site_1', 'user-1');

    expect(result).toBeNull();
  });
});

describe('MongoDBAdapter.getUserDetail bot filter', () => {
  it('default mode excludes bot-flagged docs from the merged-detail pipeline', async () => {
    const adapter = new MongoDBAdapter('mongodb://127.0.0.1:1/x');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    const aggregate = vi.fn((_pipeline: any[]) => ({ toArray: async () => [MONGO_ROW] }));
    (adapter as any).collection = { aggregate };

    await adapter.getUserDetail('site_1', 'user-1');

    const pipeline = aggregate.mock.calls[0]![0];
    expect(pipeline[0].$match.bot_flag).toBeNull();
  });

  it('includeBots: true does not filter bot-flagged docs out of the merged-detail pipeline', async () => {
    const adapter = new MongoDBAdapter('mongodb://127.0.0.1:1/x');
    vi.spyOn(adapter as any, 'getVisitorIdsForUser').mockResolvedValue(['v1']);
    const aggregate = vi.fn((_pipeline: any[]) => ({ toArray: async () => [MONGO_ROW] }));
    (adapter as any).collection = { aggregate };

    await adapter.getUserDetail('site_1', 'user-1', { includeBots: true });

    const pipeline = aggregate.mock.calls[0]![0];
    expect(pipeline[0].$match).not.toHaveProperty('bot_flag');
  });
});
