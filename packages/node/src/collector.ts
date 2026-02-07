import type {
  CollectorConfig,
  DBAdapter,
  EnrichedEvent,
  ClientEvent,
  CollectPayload,
  QueryParams,
  QueryResult,
  TimeSeriesParams,
  RetentionParams,
  EventListParams,
  EventListResult,
  UserListParams,
  UserListResult,
  UserDetail,
  Site,
  CreateSiteRequest,
  UpdateSiteRequest,
} from '@litemetrics/core';
import { ClickHouseAdapter } from './adapters/clickhouse';
import { MongoDBAdapter } from './adapters/mongodb';
import { initGeoIP, resolveGeo } from './geoip';
import { parseUserAgent } from './useragent';

export interface Collector {
  handler(): (req: any, res: any) => void | Promise<void>;
  queryHandler(): (req: any, res: any) => void | Promise<void>;
  eventsHandler(): (req: any, res: any) => void | Promise<void>;
  usersHandler(): (req: any, res: any) => void | Promise<void>;
  sitesHandler(): (req: any, res: any) => void | Promise<void>;
  query(params: QueryParams): Promise<QueryResult>;
  listEvents(params: EventListParams): Promise<EventListResult>;
  listUsers(params: UserListParams): Promise<UserListResult>;
  getUserDetail(siteId: string, visitorId: string): Promise<UserDetail | null>;
  getUserEvents(siteId: string, visitorId: string, params: EventListParams): Promise<EventListResult>;
  track(siteId: string, name: string, properties?: Record<string, unknown>, options?: { userId?: string; ip?: string }): Promise<void>;
  identify(siteId: string, userId: string, traits?: Record<string, unknown>, options?: { ip?: string }): Promise<void>;
  createSite(data: CreateSiteRequest): Promise<Site>;
  listSites(): Promise<Site[]>;
  getSite(siteId: string): Promise<Site | null>;
  updateSite(siteId: string, data: UpdateSiteRequest): Promise<Site | null>;
  deleteSite(siteId: string): Promise<boolean>;
  regenerateSecret(siteId: string): Promise<Site | null>;
  close(): Promise<void>;
}

export async function createCollector(config: CollectorConfig): Promise<Collector> {
  const db = createAdapter(config.db);
  await db.init();

  if (config.geoip) {
    const geoipConfig = typeof config.geoip === 'object' ? config.geoip : {};
    await initGeoIP(geoipConfig.dbPath);
  }

  // ─── Auth helpers ──────────────────────────────────────

  function isAdmin(req: any): boolean {
    if (!config.adminSecret) return false;
    return req.headers?.['x-litemetrics-admin-secret'] === config.adminSecret;
  }

  async function isAuthorizedForSite(req: any, siteId: string): Promise<boolean> {
    // Admin can access everything
    if (isAdmin(req)) return true;
    // Check site secret
    const secret = req.headers?.['x-litemetrics-secret'];
    if (!secret) return false;
    const site = await db.getSiteBySecret(secret);
    return site !== null && site.siteId === siteId;
  }

  // ─── CORS helper ──────────────────────────────────────

  function setCors(req: any, res: any, methods: string, extraHeaders?: string): boolean {
    if (!config.cors) return false;
    const origin = req.headers?.origin;
    const allowed = !config.cors.origins || config.cors.origins.length === 0 || config.cors.origins.includes(origin);
    if (allowed) {
      res.setHeader?.('Access-Control-Allow-Origin', origin || '*');
      res.setHeader?.('Access-Control-Allow-Methods', methods);
      const headers = ['Content-Type', extraHeaders].filter(Boolean).join(', ');
      res.setHeader?.('Access-Control-Allow-Headers', headers);
    }
    if (req.method === 'OPTIONS') {
      res.writeHead?.(204);
      res.end?.();
      return true;
    }
    return false;
  }

  // ─── Event helpers ────────────────────────────────────

  function enrichEvents(events: ClientEvent[], ip: string, userAgent: string): EnrichedEvent[] {
    const device = parseUserAgent(userAgent);
    return events.map((event) => {
      const geo = resolveGeo(ip, event.timezone);
      return { ...event, ip, geo, device };
    });
  }

  function extractIp(req: any): string {
    if (config.trustProxy ?? true) {
      const forwarded = req.headers?.['x-forwarded-for'];
      if (forwarded) {
        const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
        return first.trim();
      }
      if (req.headers?.['x-real-ip']) return req.headers['x-real-ip'];
    }
    return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  }

  // ─── Handlers ─────────────────────────────────────────

  function handler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      if (setCors(req, res, 'POST, OPTIONS')) return;

      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      try {
        const body = await parseBody(req);
        const payload = body as CollectPayload;

        if (!payload?.events || !Array.isArray(payload.events) || payload.events.length === 0) {
          sendJson(res, 400, { ok: false, error: 'No events provided' });
          return;
        }
        if (payload.events.length > 100) {
          sendJson(res, 400, { ok: false, error: 'Too many events (max 100)' });
          return;
        }

        const ip = extractIp(req);
        const userAgent = req.headers?.['user-agent'] || '';
        const enriched = enrichEvents(payload.events, ip, userAgent);

        await db.insertEvents(enriched);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
      }
    };
  }

  function queryHandler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      if (setCors(req, res, 'GET, OPTIONS', 'X-Litemetrics-Secret, X-Litemetrics-Admin-Secret')) return;

      try {
        const params = extractQueryParams(req);

        if (!params.siteId) {
          sendJson(res, 400, { ok: false, error: 'siteId is required' });
          return;
        }
        if (!params.metric) {
          sendJson(res, 400, { ok: false, error: 'metric is required' });
          return;
        }

        // Auth check
        const authorized = await isAuthorizedForSite(req, params.siteId);
        if (!authorized) {
          sendJson(res, 401, { ok: false, error: 'Invalid or missing secret key' });
          return;
        }

        // Time series query
        if (params.metric === 'timeseries' as any) {
          const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
          const tsParams: TimeSeriesParams = {
            siteId: params.siteId,
            metric: (q.tsMetric as TimeSeriesParams['metric']) || 'pageviews',
            period: params.period,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            granularity: q.granularity as TimeSeriesParams['granularity'],
          };
          const result = await db.queryTimeSeries(tsParams);
          sendJson(res, 200, result);
          return;
        }

        // Retention query
        if (params.metric === 'retention' as any) {
          const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
          const retentionParams: RetentionParams = {
            siteId: params.siteId,
            period: params.period,
            weeks: q.weeks ? parseInt(q.weeks as string, 10) : undefined,
          };
          const result = await db.queryRetention(retentionParams);
          sendJson(res, 200, result);
          return;
        }

        const result = await db.query(params);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
      }
    };
  }

  function sitesHandler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      if (setCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS', 'X-Litemetrics-Admin-Secret')) return;

      // Admin auth required for all site management
      if (!isAdmin(req)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized - invalid or missing admin secret' });
        return;
      }

      try {
        const method = req.method;
        // Extract path - works with Express params or raw URL
        const url = new URL(req.url || '/', 'http://localhost');
        const pathSegments = url.pathname.split('/').filter(Boolean);
        // Find the segment after 'sites' in the path
        const sitesIdx = pathSegments.indexOf('sites');
        const siteId = sitesIdx >= 0 ? pathSegments[sitesIdx + 1] : undefined;
        const action = sitesIdx >= 0 ? pathSegments[sitesIdx + 2] : undefined;

        // POST /api/sites/:siteId/regenerate
        if (method === 'POST' && siteId && action === 'regenerate') {
          const site = await db.regenerateSecret(siteId);
          if (!site) { sendJson(res, 404, { ok: false, error: 'Site not found' }); return; }
          sendJson(res, 200, { site });
          return;
        }

        // GET /api/sites - list
        if (method === 'GET' && !siteId) {
          const sites = await db.listSites();
          sendJson(res, 200, { sites, total: sites.length });
          return;
        }

        // GET /api/sites/:siteId - get one
        if (method === 'GET' && siteId) {
          const site = await db.getSite(siteId);
          if (!site) { sendJson(res, 404, { ok: false, error: 'Site not found' }); return; }
          sendJson(res, 200, { site });
          return;
        }

        // POST /api/sites - create
        if (method === 'POST' && !siteId) {
          const body = await parseBody(req) as CreateSiteRequest;
          if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
            sendJson(res, 400, { ok: false, error: 'Site name is required' });
            return;
          }
          const site = await db.createSite(body);
          sendJson(res, 201, { site });
          return;
        }

        // PUT /api/sites/:siteId - update
        if (method === 'PUT' && siteId) {
          const body = await parseBody(req) as UpdateSiteRequest;
          const site = await db.updateSite(siteId, body);
          if (!site) { sendJson(res, 404, { ok: false, error: 'Site not found' }); return; }
          sendJson(res, 200, { site });
          return;
        }

        // DELETE /api/sites/:siteId - delete
        if (method === 'DELETE' && siteId) {
          const deleted = await db.deleteSite(siteId);
          if (!deleted) { sendJson(res, 404, { ok: false, error: 'Site not found' }); return; }
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 404, { ok: false, error: 'Not found' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
      }
    };
  }

  // ─── Events handler ────────────────────────────────────

  function eventsHandler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      if (setCors(req, res, 'GET, OPTIONS', 'X-Litemetrics-Secret, X-Litemetrics-Admin-Secret')) return;

      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      try {
        const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);

        if (!q.siteId) {
          sendJson(res, 400, { ok: false, error: 'siteId is required' });
          return;
        }

        const authorized = await isAuthorizedForSite(req, q.siteId as string);
        if (!authorized) {
          sendJson(res, 401, { ok: false, error: 'Invalid or missing secret key' });
          return;
        }

        const params: EventListParams = {
          siteId: q.siteId as string,
          type: q.type as EventListParams['type'],
          eventName: q.eventName as string | undefined,
          visitorId: q.visitorId as string | undefined,
          userId: q.userId as string | undefined,
          period: q.period as EventListParams['period'],
          dateFrom: q.dateFrom as string | undefined,
          dateTo: q.dateTo as string | undefined,
          limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
          offset: q.offset ? parseInt(q.offset as string, 10) : undefined,
        };

        const result = await db.listEvents(params);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
      }
    };
  }

  // ─── Users handler ────────────────────────────────────

  function usersHandler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      if (setCors(req, res, 'GET, OPTIONS', 'X-Litemetrics-Secret, X-Litemetrics-Admin-Secret')) return;

      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      try {
        const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);

        if (!q.siteId) {
          sendJson(res, 400, { ok: false, error: 'siteId is required' });
          return;
        }

        const authorized = await isAuthorizedForSite(req, q.siteId as string);
        if (!authorized) {
          sendJson(res, 401, { ok: false, error: 'Invalid or missing secret key' });
          return;
        }

        // Extract path to check for /api/users/:visitorId or /api/users/:visitorId/events
        const url = new URL(req.url || '/', 'http://localhost');
        const pathSegments = url.pathname.split('/').filter(Boolean);
        const usersIdx = pathSegments.indexOf('users');
        const visitorId = usersIdx >= 0 ? pathSegments[usersIdx + 1] : undefined;
        const action = usersIdx >= 0 ? pathSegments[usersIdx + 2] : undefined;

        // GET /api/users/:visitorId/events
        if (visitorId && action === 'events') {
          const params: EventListParams = {
            siteId: q.siteId as string,
            type: q.type as EventListParams['type'],
            period: q.period as EventListParams['period'],
            dateFrom: q.dateFrom as string | undefined,
            dateTo: q.dateTo as string | undefined,
            limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
            offset: q.offset ? parseInt(q.offset as string, 10) : undefined,
          };
          const result = await db.getUserEvents(q.siteId as string, decodeURIComponent(visitorId), params);
          sendJson(res, 200, result);
          return;
        }

        // GET /api/users/:visitorId
        if (visitorId) {
          const user = await db.getUserDetail(q.siteId as string, decodeURIComponent(visitorId));
          if (!user) {
            sendJson(res, 404, { ok: false, error: 'User not found' });
            return;
          }
          sendJson(res, 200, { user });
          return;
        }

        // GET /api/users - list
        const params: UserListParams = {
          siteId: q.siteId as string,
          search: q.search as string | undefined,
          limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
          offset: q.offset ? parseInt(q.offset as string, 10) : undefined,
        };
        const result = await db.listUsers(params);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
      }
    };
  }

  // ─── Return collector ─────────────────────────────────

  return {
    handler,
    queryHandler,
    eventsHandler,
    usersHandler,
    sitesHandler,

    async query(params: QueryParams): Promise<QueryResult> {
      return db.query(params);
    },

    async listEvents(params: EventListParams): Promise<EventListResult> {
      return db.listEvents(params);
    },

    async listUsers(params: UserListParams): Promise<UserListResult> {
      return db.listUsers(params);
    },

    async getUserDetail(siteId: string, visitorId: string): Promise<UserDetail | null> {
      return db.getUserDetail(siteId, visitorId);
    },

    async getUserEvents(siteId: string, visitorId: string, params: EventListParams): Promise<EventListResult> {
      return db.getUserEvents(siteId, visitorId, params);
    },

    async track(siteId, name, properties, options) {
      const event: EnrichedEvent = {
        type: 'event', siteId, timestamp: Date.now(), sessionId: 'server', visitorId: 'server',
        name, properties, userId: options?.userId, ip: options?.ip,
        geo: options?.ip ? resolveGeo(options.ip) : undefined,
      };
      await db.insertEvents([event]);
    },

    async identify(siteId, userId, traits, options) {
      const event: EnrichedEvent = {
        type: 'identify', siteId, timestamp: Date.now(), sessionId: 'server', visitorId: 'server',
        userId, traits, ip: options?.ip,
        geo: options?.ip ? resolveGeo(options.ip) : undefined,
      };
      await db.insertEvents([event]);
    },

    // Programmatic site management
    createSite: (data) => db.createSite(data),
    listSites: () => db.listSites(),
    getSite: (siteId) => db.getSite(siteId),
    updateSite: (siteId, data) => db.updateSite(siteId, data),
    deleteSite: (siteId) => db.deleteSite(siteId),
    regenerateSecret: (siteId) => db.regenerateSecret(siteId),

    async close() {
      await db.close();
    },
  };
}

function createAdapter(config: CollectorConfig['db']): DBAdapter {
  const adapter = config.adapter ?? 'clickhouse';
  switch (adapter) {
    case 'clickhouse':
      return new ClickHouseAdapter(config.url);
    case 'mongodb':
      return new MongoDBAdapter(config.url);
    default:
      throw new Error(`Unknown DB adapter: ${adapter}. Supported: clickhouse, mongodb`);
  }
}

async function parseBody(req: any): Promise<unknown> {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function extractQueryParams(req: any): QueryParams {
  const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  return {
    siteId: q.siteId as string,
    metric: q.metric as QueryParams['metric'],
    period: q.period as QueryParams['period'],
    dateFrom: q.dateFrom as string | undefined,
    dateTo: q.dateTo as string | undefined,
    limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
    filters: q.filters ? JSON.parse(q.filters as string) : undefined,
    compare: q.compare === 'true' || q.compare === '1',
  };
}

function sendJson(res: any, status: number, body: unknown): void {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(body);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
