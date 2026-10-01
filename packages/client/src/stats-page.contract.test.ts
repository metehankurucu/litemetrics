import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { LitemetricsClient } from './client';
import type { QueryPageResult } from '@litemetrics/core';

// A real loopback HTTP server is the transport fixture; axios and client/auth serialization are not mocked.
let server: Server | undefined;
const result: QueryPageResult = { metric: 'top_pages', measure: 'pageviews', data: [{ key: '/pricing', value: 3, share: 1 }],
  limit: 30, rowCount: 1, valueSum: 3, denominatorValue: 3, denominatorKind: 'bucket_sum', nextCursor: null, previousCursor: null,
  snapshot: { id: 'client-snapshot', createdAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-01T00:10:00Z',
    from: '2026-09-24T00:00:00Z', to: '2026-10-01T00:00:00Z', period: '7d', timezone: 'UTC' } };
async function host(status = 200, body: unknown = result) {
  const seen: { url: URL; secret: unknown }[] = [];
  server = createServer((req,res) => { seen.push({ url: new URL(req.url!, 'http://fixture.test'), secret: req.headers['x-litemetrics-secret'] });
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { baseUrl: `http://127.0.0.1:${port}`, seen };
}
afterEach(async () => { if (server) await new Promise<void>((resolve,reject) => server!.close(err => err ? reject(err) : resolve())); server = undefined; });
describe('public getStatsPage client transport', () => {
  it('returns the complete typed page through the default endpoint/auth headers', async () => {
    const h = await host(); const client = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'codixus-docs', secretKey: 'test-only-secret' });
    expect(await client.getStatsPage('top_pages', { period: '7d' })).toEqual(result);
    expect(h.seen[0].url.pathname).toBe('/api/stats/page'); expect(h.seen[0].secret).toBe('test-only-secret');
    expect(h.seen[0].url.searchParams.get('siteId')).toBe('codixus-docs');
    expect(h.seen[0].url.searchParams.get('metric')).toBe('top_pages');
  });
  it('derives a page path from a configured legacy stats endpoint', async () => {
    const h = await host(); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs', endpoint: '/custom/stats' });
    await c.getStatsPage('top_pages'); expect(h.seen[0].url.pathname).toBe('/custom/stats/page');
  });
  it('honors an explicit additive page endpoint', async () => {
    const h = await host(); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs', pageEndpoint: '/custom/page-v1' });
    await c.getStatsPage('top_pages'); expect(h.seen[0].url.pathname).toBe('/custom/page-v1');
  });
  it('round-trips opaque cursor/snapshot and literal search without decoding', async () => {
    const h = await host(); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs' });
    await c.getStatsPage('top_pages', { cursor: 'v1.a+/=%25', snapshot: 'old-snapshot', search: '/docs?tag=_%[a]', minCount: 0, limit: 50 });
    const p = h.seen[0].url.searchParams;
    expect(p.get('cursor')).toBe('v1.a+/=%25'); expect(p.get('snapshot')).toBe('old-snapshot');
    expect(p.get('search')).toBe('/docs?tag=_%[a]'); expect(p.get('minCount')).toBe('0'); expect(p.get('limit')).toBe('50');
  });
  it('serializes an explicit empty eligible key set distinctly from absent keys', async () => {
    const h = await host(); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs' });
    await c.getStatsPage('top_countries', { keys: [] });
    expect(JSON.parse(h.seen[0].url.searchParams.get('keys')!)).toEqual([]);
  });
  it('preserves event filter values, zero minimum and false includeBots', async () => {
    const h = await host(); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs' });
    await c.getStatsPage('top_pages', { filters: { 'geo.country': 'TR' }, includeBots: false, minCount: 0 });
    const p = h.seen[0].url.searchParams;
    expect(JSON.parse(p.get('filters')!)).toEqual({ 'geo.country': 'TR' }); expect(p.get('includeBots')).toBe('false'); expect(p.get('minCount')).toBe('0');
  });
  it('rejects a non-2xx expiry instead of returning an empty successful page', async () => {
    const h = await host(409, { error: 'snapshot_expired' }); const c = new LitemetricsClient({ baseUrl: h.baseUrl, siteId: 'docs' });
    await expect(c.getStatsPage('top_pages', { cursor: 'old' })).rejects.toMatchObject({ response: { status: 409, data: { error: 'snapshot_expired' } } });
  });
});
