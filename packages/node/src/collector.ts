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
import { isBot } from './botfilter';

export interface Collector {
  handler(): (req: any, res: any) => void | Promise<void>;
  queryHandler(): (req: any, res: any) => void | Promise<void>;
  eventsHandler(): (req: any, res: any) => void | Promise<void>;
  usersHandler(): (req: any, res: any) => void | Promise<void>;
  sitesHandler(): (req: any, res: any) => void | Promise<void>;
  query(params: QueryParams): Promise<QueryResult>;
  listEvents(params: EventListParams): Promise<EventListResult>;
  listUsers(params: UserListParams): Promise<UserListResult>;
  getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null>;
  getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult>;
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
      res.setHeader?.('Access-Control-Allow-Credentials', 'true');
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

  // ─── Identity resolution ────────────────────────────────
  // In-memory cache: siteId:visitorId → userId (5 min TTL)
  const identityCache = new Map<string, { userId: string; expires: number }>();
  const IDENTITY_CACHE_TTL = 5 * 60 * 1000;

  function getCachedUserId(siteId: string, visitorId: string): string | undefined {
    const key = `${siteId}:${visitorId}`;
    const entry = identityCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      identityCache.delete(key);
      return undefined;
    }
    return entry.userId;
  }

  function setCachedUserId(siteId: string, visitorId: string, userId: string): void {
    const key = `${siteId}:${visitorId}`;
    identityCache.set(key, { userId, expires: Date.now() + IDENTITY_CACHE_TTL });
    // Evict old entries if cache grows too large
    if (identityCache.size > 10000) {
      const now = Date.now();
      for (const [k, v] of identityCache) {
        if (now > v.expires) identityCache.delete(k);
      }
    }
  }

  async function processIdentity(events: EnrichedEvent[]): Promise<void> {
    for (const event of events) {
      // Skip sentinel visitorId used by server-side programmatic calls
      if (!event.visitorId || event.visitorId === 'server') continue;

      if (event.type === 'identify' && event.userId) {
        // Identify event → upsert identity map and cache
        await db.upsertIdentity(event.siteId, event.visitorId, event.userId);
        setCachedUserId(event.siteId, event.visitorId, event.userId);
      } else if (!event.userId) {
        // Non-identify event without userId → try to resolve from cache or DB
        const cached = getCachedUserId(event.siteId, event.visitorId);
        if (cached) {
          event.userId = cached;
        } else {
          const resolved = await db.getUserIdForVisitor(event.siteId, event.visitorId);
          if (resolved) {
            event.userId = resolved;
            setCachedUserId(event.siteId, event.visitorId, resolved);
          }
        }
      } else if (event.userId) {
        // Event already has userId → persist and cache the mapping
        setCachedUserId(event.siteId, event.visitorId, event.userId);
        await db.upsertIdentity(event.siteId, event.visitorId, event.userId);
      }
    }
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

  function extractRequestHostname(req: any): string | undefined {
    const headerValue = (value: unknown): string | undefined => {
      if (Array.isArray(value)) return value[0];
      if (typeof value === 'string') return value;
      return undefined;
    };

    const origin = headerValue(req.headers?.origin);
    const referer = headerValue(req.headers?.referer) || headerValue(req.headers?.referrer);
    const raw = origin ?? referer;
    if (!raw || raw === 'null') return undefined;

    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  // ─── Handlers ─────────────────────────────────────────

  function handler(): (req: any, res: any) => void | Promise<void> {
    return async (req: any, res: any) => {
      // Collect endpoint is public — always allow cross-origin
      res.setHeader?.('Access-Control-Allow-Origin', '*');
      res.setHeader?.('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader?.('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead?.(204);
        res.end?.();
        return;
      }

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

        const siteIds = new Set(payload.events.map((event) => event.siteId).filter(Boolean));
        if (siteIds.size !== 1) {
          sendJson(res, 200, { ok: true });
          return;
        }
        const siteId = Array.from(siteIds)[0] as string;

        const userAgent = req.headers?.['user-agent'] || '';

        // Bot check - silent drop
        if (isBot(userAgent)) {
          sendJson(res, 200, { ok: true });
          return;
        }

        const ip = extractIp(req);
        const enriched = enrichEvents(payload.events, ip, userAgent);

        // Hostname filtering: check request's Origin/Referer against site's allowedOrigins
        const site = await db.getSite(siteId);
        if (site?.allowedOrigins && site.allowedOrigins.length > 0) {
          const requestHostname = extractRequestHostname(req);
          if (!requestHostname) {
            sendJson(res, 200, { ok: true });
            return;
          }
          const allowed = new Set(site.allowedOrigins.map((h) => h.toLowerCase()));
          if (!allowed.has(requestHostname)) {
            sendJson(res, 200, { ok: true });
            return;
          }
        }

        await processIdentity(enriched);
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
            filters: q.filters ? JSON.parse(q.filters as string) : undefined,
          };
          if (tsParams.metric === 'conversions') {
            const site = await db.getSite(params.siteId);
            tsParams.conversionEvents = site?.conversionEvents ?? [];
          }
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

        const isConversionMetric = params.metric === 'conversions' || params.metric === 'top_conversions';
        let result: QueryResult;
        if (isConversionMetric) {
          const site = await db.getSite(params.siteId);
          const conversionEvents = site?.conversionEvents ?? [];
          result = await db.query({ ...params, conversionEvents });
        } else {
          result = await db.query(params);
        }
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

        const eventNames = typeof q.eventNames === 'string'
          ? q.eventNames.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;

        const params: EventListParams = {
          siteId: q.siteId as string,
          type: q.type as EventListParams['type'],
          eventName: q.eventName as string | undefined,
          eventNames,
          eventSource: q.eventSource as EventListParams['eventSource'],
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
          const eventNames = typeof q.eventNames === 'string'
            ? q.eventNames.split(',').map((s: string) => s.trim()).filter(Boolean)
            : undefined;

          const params: EventListParams = {
            siteId: q.siteId as string,
            type: q.type as EventListParams['type'],
            eventName: q.eventName as string | undefined,
            eventNames,
            eventSource: q.eventSource as EventListParams['eventSource'],
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

    async getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null> {
      return db.getUserDetail(siteId, identifier);
    },

    async getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult> {
      return db.getUserEvents(siteId, identifier, params);
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
  // Already parsed by middleware (e.g. express.json())
  if (req.body && typeof req.body === 'object') return req.body;
  // Raw string body (e.g. express.text() or text/plain content-type)
  if (typeof req.body === 'string') return JSON.parse(req.body);
  // Manual stream parsing
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
