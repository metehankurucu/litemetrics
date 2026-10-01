import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryPageParams, QueryPageResult, Site } from '@litemetrics/core';

// Constructor seam replaces the external database only; real collector auth/parser/error handling run.
const seam = vi.hoisted(() => ({ page: vi.fn(), getSite: vi.fn(), getSiteBySecret: vi.fn(), capable: true }));
vi.mock('./adapters/clickhouse', () => ({ ClickHouseAdapter: class {
  init = async () => {}; close = async () => {}; insertEvents = async () => {};
  query = async () => ({ metric: 'top_pages', total: 1, data: [{ key: '/legacy', value: 1 }] });
  queryTimeSeries = async () => ({}); queryRetention = async () => ({});
  queryBotStats = async () => ({}); listEvents = async () => ({}); listUsers = async () => ({});
  getUserDetail = async () => null; getUserEvents = async () => ({});
  deleteUserEvents = async () => ({ deleted: 0 }); upsertIdentity = async () => {};
  getVisitorIdsForUser = async () => []; getUserIdForVisitor = async () => null;
  createSite = async () => ({}); listSites = async () => []; updateSite = async () => null;
  deleteSite = async () => false; regenerateSecret = async () => null;
  getSite = seam.getSite; getSiteBySecret = seam.getSiteBySecret;
  get queryPage() { return seam.capable ? seam.page : undefined; }
} }));
import { createCollector } from './collector';
import { AggregatePageError } from './aggregate-page';

const site: Site = { siteId: 'codixus-docs', secretKey: 'test-only-site-secret', name: 'Codixus docs',
  type: 'web', domain: 'docs.example.test', conversionEvents: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const metrics = ['top_pages','top_referrers','top_countries','top_os','top_app_versions','top_devices'] as const;
function answer(metric: QueryPageResult['metric'] = 'top_pages'): QueryPageResult {
  return { metric, measure: metric === 'top_pages' || metric === 'top_referrers' ? 'pageviews' : 'visitors',
    data: [{ key: '/pricing', value: 4, share: 1 }], limit: 30, rowCount: 1, valueSum: 4,
    denominatorValue: 4, denominatorKind: 'bucket_sum', nextCursor: null, previousCursor: null,
    snapshot: { id: 'snap-handler-1', createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-01T00:10:00.000Z',
      from: '2026-09-24T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', period: '7d', timezone: 'UTC' } };
}
function response() {
  const r = { statusCode: 200, body: undefined as any, setHeader() {},
    writeHead(code: number) { r.statusCode = code; }, status(code: number) { r.statusCode = code; return r; },
    json(body: unknown) { r.body = body; }, end(data?: string) { if (data) r.body = JSON.parse(data); } };
  return r;
}
async function request(query: Record<string, unknown>, headers: Record<string,string> = { 'x-litemetrics-secret': site.secretKey }) {
  const collector = await createCollector({ db: { adapter: 'clickhouse', url: 'http://db.invalid.test:8123' }, adminSecret: 'test-only-admin' });
  const res = response();
  await collector.queryPageHandler()({ method: 'GET', query: { siteId: site.siteId, metric: 'top_pages', ...query }, headers, socket: {} }, res);
  await collector.close();
  return res;
}
beforeEach(() => {
  vi.clearAllMocks(); seam.capable = true;
  seam.getSite.mockResolvedValue(site);
  seam.getSiteBySecret.mockImplementation(async (key: string) => key === site.secretKey ? site : null);
  seam.page.mockImplementation(async (q: QueryPageParams) => answer(q.metric));
});
describe('L1-L7 public collector page contract', () => {
  it.each(metrics)('serves the complete wire result for %s', async metric => {
    const res = await request({ metric, period: '7d', limit: '30' });
    expect(res.statusCode).toBe(200); expect(res.body).toEqual(answer(metric));
  });
  it('authorizes an admin through the existing admin header', async () => {
    const res = await request({ period: '7d' }, { 'x-litemetrics-admin-secret': 'test-only-admin' });
    expect(res.statusCode).toBe(200); expect(res.body.data).toEqual([{ key: '/pricing', value: 4, share: 1 }]);
  });
  it('rejects missing authorization before exposing a malformed cursor', async () => {
    const res = await request({ cursor: 'tampered' }, {});
    expect(res.statusCode).toBe(401); expect(res.body).not.toHaveProperty('data'); expect(seam.page).not.toHaveBeenCalled();
  });
  it('rejects another site secret without exposing rows', async () => {
    const res = await request({}, { 'x-litemetrics-secret': 'other-site-test-secret' });
    expect(res.statusCode).toBe(401); expect(res.body).not.toHaveProperty('data');
  });
  it.each([
    { limit: '0' }, { limit: '51' }, { limit: '2.5' }, { limit: ['30','50'] },
    { period: 'yesterday' }, { timezone: 'Mars/Olympus' }, { minCount: '-1' },
    { search: '🙂'.repeat(101) }, { mystery: 'ignored?' }, { filters: '{broken' },
    { filters: JSON.stringify({ not_a_filter: 'TR' }) }, { filters: JSON.stringify({ 'geo.country': ['TR'] }) },
    { keys: JSON.stringify(Array.from({ length: 251 }, (_, n) => String(n))) },
  ])('rejects malformed input before source work: %j', async query => {
    const res = await request(query);
    expect(res.statusCode).toBe(400); expect(res.body.error).toBe('invalid_filter'); expect(seam.page).not.toHaveBeenCalled();
  });
  it.each([
    ['snapshot_expired',409], ['cursor_query_mismatch',400], ['invalid_cursor',400],
    ['snapshot_capacity',429], ['aggregate_snapshot_unavailable',503],
  ] as const)('propagates the named adapter outcome %s', async (code, status) => {
    const err = new AggregatePageError(code, status); if (status === 429) err.retryAfterMs = 5000;
    seam.page.mockRejectedValueOnce(err);
    const res = await request({ period: '7d' });
    expect(res.statusCode).toBe(status); expect(res.body.error).toBe(code);
    expect(res.body).not.toHaveProperty('data'); if (status === 429) expect(res.body.retryAfterMs).toBe(5000);
  });
  it('returns a named capability error for an old structural adapter', async () => {
    seam.capable = false; const res = await request({});
    expect(res.statusCode).toBe(503); expect(res.body.error).toBe('aggregate_snapshot_unavailable');
  });
  it('scrubs unexpected provider errors', async () => {
    seam.page.mockRejectedValueOnce(new Error('provider credential=test-only-do-not-expose'));
    const res = await request({});
    expect(res.statusCode).toBe(500); expect(res.body.error).toBe('internal');
    expect(JSON.stringify(res.body)).not.toContain('test-only-do-not-expose');
  });
});
