import type { DBAdapter, EnrichedEvent, QueryParams, QueryResult, QueryDataPoint, Granularity, TimeSeriesParams, TimeSeriesResult, RetentionParams, RetentionResult, RetentionCohort, Site, CreateSiteRequest, UpdateSiteRequest, EventListParams, EventListResult, EventListItem, UserListParams, UserListResult, UserDetail } from '@insayt/core';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { resolvePeriod, previousPeriodRange, autoGranularity, fillBuckets, granularityToDateFormat, getISOWeek, generateSiteId, generateSecretKey } from './utils';

const EVENTS_TABLE = 'insayt_events';
const SITES_TABLE = 'insayt_sites';

const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
    event_id       UUID DEFAULT generateUUIDv4(),
    site_id        LowCardinality(String),
    type           LowCardinality(String),
    timestamp      DateTime64(3),
    session_id     String,
    visitor_id     String,
    url            Nullable(String),
    referrer       Nullable(String),
    title          Nullable(String),
    event_name     Nullable(String),
    properties     Nullable(String),
    user_id        Nullable(String),
    traits         Nullable(String),
    country        LowCardinality(Nullable(String)),
    city           Nullable(String),
    region         Nullable(String),
    device_type    LowCardinality(Nullable(String)),
    browser        LowCardinality(Nullable(String)),
    os             LowCardinality(Nullable(String)),
    language       LowCardinality(Nullable(String)),
    timezone       Nullable(String),
    screen_width   Nullable(UInt16),
    screen_height  Nullable(UInt16),
    utm_source     Nullable(String),
    utm_medium     Nullable(String),
    utm_campaign   Nullable(String),
    utm_term       Nullable(String),
    utm_content    Nullable(String),
    ip             Nullable(String),
    created_at     DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (site_id, timestamp, visitor_id)
  SETTINGS index_granularity = 8192
`;

const CREATE_SITES_TABLE = `
CREATE TABLE IF NOT EXISTS ${SITES_TABLE} (
    site_id          String,
    secret_key       String,
    name             String,
    domain           Nullable(String),
    allowed_origins  Nullable(String),
    created_at       DateTime64(3),
    updated_at       DateTime64(3),
    version          UInt64,
    is_deleted       UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(version)
  ORDER BY (site_id)
  SETTINGS index_granularity = 8192
`;

export class ClickHouseAdapter implements DBAdapter {
  private client: ClickHouseClient;

  constructor(url: string) {
    this.client = createClient({
      url,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
  }

  async init(): Promise<void> {
    await this.client.command({ query: CREATE_EVENTS_TABLE });
    await this.client.command({ query: CREATE_SITES_TABLE });
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  // ─── Event Insertion ──────────────────────────────────────

  async insertEvents(events: EnrichedEvent[]): Promise<void> {
    if (events.length === 0) return;

    const rows = events.map((e) => ({
      site_id: e.siteId,
      type: e.type,
      timestamp: new Date(e.timestamp).toISOString(),
      session_id: e.sessionId,
      visitor_id: e.visitorId,
      url: e.url ?? null,
      referrer: e.referrer ?? null,
      title: e.title ?? null,
      event_name: e.name ?? null,
      properties: e.properties ? JSON.stringify(e.properties) : null,
      user_id: e.userId ?? null,
      traits: e.traits ? JSON.stringify(e.traits) : null,
      country: e.geo?.country ?? null,
      city: e.geo?.city ?? null,
      region: e.geo?.region ?? null,
      device_type: e.device?.type ?? null,
      browser: e.device?.browser ?? null,
      os: e.device?.os ?? null,
      language: e.language ?? null,
      timezone: e.timezone ?? null,
      screen_width: e.screen?.width ?? null,
      screen_height: e.screen?.height ?? null,
      utm_source: e.utm?.source ?? null,
      utm_medium: e.utm?.medium ?? null,
      utm_campaign: e.utm?.campaign ?? null,
      utm_term: e.utm?.term ?? null,
      utm_content: e.utm?.content ?? null,
      ip: e.ip ?? null,
    }));

    await this.client.insert({
      table: EVENTS_TABLE,
      values: rows,
      format: 'JSONEachRow',
    });
  }

  // ─── Analytics Queries ──────────────────────────────────────

  async query(q: QueryParams): Promise<QueryResult> {
    const { dateRange, period } = resolvePeriod(q);
    const siteId = q.siteId;
    const limit = q.limit ?? 10;

    const params = {
      siteId,
      from: dateRange.from,
      to: dateRange.to,
      limit,
    };

    let data: QueryDataPoint[] = [];
    let total = 0;

    switch (q.metric) {
      case 'pageviews': {
        const rows = await this.queryRows<{ value: string }>(
          `SELECT count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'pageview'`,
          params,
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'pageviews', value: total }];
        break;
      }

      case 'visitors': {
        const rows = await this.queryRows<{ value: string }>(
          `SELECT uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}`,
          params,
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'visitors', value: total }];
        break;
      }

      case 'sessions': {
        const rows = await this.queryRows<{ value: string }>(
          `SELECT uniq(session_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}`,
          params,
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'sessions', value: total }];
        break;
      }

      case 'events': {
        const rows = await this.queryRows<{ value: string }>(
          `SELECT count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'`,
          params,
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'events', value: total }];
        break;
      }

      case 'top_pages': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT url AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'pageview'
             AND url IS NOT NULL
           GROUP BY url
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_referrers': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT referrer AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'pageview'
             AND referrer IS NOT NULL
             AND referrer != ''
           GROUP BY referrer
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_countries': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT country AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND country IS NOT NULL
           GROUP BY country
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_cities': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT city AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND city IS NOT NULL
           GROUP BY city
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_events': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT event_name AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_name IS NOT NULL
           GROUP BY event_name
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_devices': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT device_type AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND device_type IS NOT NULL
           GROUP BY device_type
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_browsers': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT browser AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND browser IS NOT NULL
           GROUP BY browser
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_os': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT os AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND os IS NOT NULL
           GROUP BY os
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          params,
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
    }

    const result: QueryResult = { metric: q.metric, period, data, total };

    // Comparison with previous period
    if (q.compare && ['pageviews', 'visitors', 'sessions', 'events'].includes(q.metric)) {
      const prevRange = previousPeriodRange(dateRange);
      const prevResult = await this.query({
        ...q,
        compare: false,
        period: 'custom',
        dateFrom: prevRange.from,
        dateTo: prevRange.to,
      });
      result.previousTotal = prevResult.total;
      if (prevResult.total > 0) {
        result.changePercent = Math.round(((total - prevResult.total) / prevResult.total) * 1000) / 10;
      } else if (total > 0) {
        result.changePercent = 100;
      } else {
        result.changePercent = 0;
      }
    }

    return result;
  }

  // ─── Time Series ──────────────────────────────────────

  async queryTimeSeries(params: TimeSeriesParams): Promise<TimeSeriesResult> {
    const { dateRange, period } = resolvePeriod({
      period: params.period,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    const granularity = params.granularity ?? autoGranularity(period);
    const bucketFn = this.granularityToClickHouseFunc(granularity);
    const dateFormat = granularityToDateFormat(granularity);

    const typeFilter = params.metric === 'pageviews' ? `AND type = 'pageview'` : '';

    let sql: string;
    if (params.metric === 'visitors' || params.metric === 'sessions') {
      const field = params.metric === 'visitors' ? 'visitor_id' : 'session_id';
      sql = `
        SELECT ${bucketFn} AS bucket, uniq(${field}) AS value
        FROM ${EVENTS_TABLE}
        WHERE site_id = {siteId:String}
          AND timestamp >= {from:String}
          AND timestamp <= {to:String}
          ${typeFilter}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
    } else {
      sql = `
        SELECT ${bucketFn} AS bucket, count() AS value
        FROM ${EVENTS_TABLE}
        WHERE site_id = {siteId:String}
          AND timestamp >= {from:String}
          AND timestamp <= {to:String}
          ${typeFilter}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
    }

    const rows = await this.queryRows<{ bucket: string; value: string }>(sql, {
      siteId: params.siteId,
      from: dateRange.from,
      to: dateRange.to,
    });

    // Convert ClickHouse bucket format to match the dateFormat used by fillBuckets
    const mappedRows = rows.map((r) => ({
      _id: this.convertClickHouseBucket(r.bucket, granularity),
      value: Number(r.value),
    }));

    const data = fillBuckets(
      new Date(dateRange.from),
      new Date(dateRange.to),
      granularity,
      dateFormat,
      mappedRows,
    );

    return { metric: params.metric, granularity, data };
  }

  private granularityToClickHouseFunc(g: Granularity): string {
    switch (g) {
      case 'hour': return 'toStartOfHour(timestamp)';
      case 'day': return 'toStartOfDay(timestamp)';
      case 'week': return 'toStartOfWeek(timestamp, 1)';  // 1 = Monday
      case 'month': return 'toStartOfMonth(timestamp)';
    }
  }

  private convertClickHouseBucket(bucket: string, granularity: Granularity): string {
    // ClickHouse returns ISO datetime strings, convert to the format used by fillBuckets
    const date = new Date(bucket);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');

    switch (granularity) {
      case 'hour': return `${y}-${m}-${d}T${h}:00`;
      case 'day': return `${y}-${m}-${d}`;
      case 'week': {
        const jan4 = new Date(y, 0, 4);
        const dayOfYear = Math.ceil((date.getTime() - new Date(y, 0, 1).getTime()) / 86400000) + 1;
        const jan4Day = jan4.getDay() || 7;
        const weekNum = Math.ceil((dayOfYear + jan4Day - 1) / 7);
        return `${y}-W${String(weekNum).padStart(2, '0')}`;
      }
      case 'month': return `${y}-${m}`;
    }
  }

  // ─── Retention ──────────────────────────────────────

  async queryRetention(params: RetentionParams): Promise<RetentionResult> {
    const weeks = params.weeks ?? 8;
    const now = new Date();
    const startDate = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

    const rows = await this.queryRows<{
      visitor_id: string;
      first_event: string;
      active_weeks: string[];
    }>(
      `SELECT
        visitor_id,
        min(timestamp) AS first_event,
        groupUniqArray(toStartOfWeek(timestamp, 1)) AS active_weeks
      FROM ${EVENTS_TABLE}
      WHERE site_id = {siteId:String}
        AND timestamp >= {since:String}
      GROUP BY visitor_id`,
      {
        siteId: params.siteId,
        since: startDate.toISOString(),
      },
    );

    // Group visitors by cohort week
    const cohortMap = new Map<string, { visitors: Set<string>; weekSets: Map<string, Set<string>> }>();

    for (const v of rows) {
      const firstDate = new Date(v.first_event);
      const cohortWeek = getISOWeek(firstDate);
      if (!cohortMap.has(cohortWeek)) {
        cohortMap.set(cohortWeek, { visitors: new Set(), weekSets: new Map() });
      }
      const cohort = cohortMap.get(cohortWeek)!;
      cohort.visitors.add(v.visitor_id);

      // active_weeks from ClickHouse are DateTime strings
      const eventWeeks = (Array.isArray(v.active_weeks) ? v.active_weeks : []).map((w: string) => {
        const d = new Date(w);
        return getISOWeek(d);
      });

      for (const w of eventWeeks) {
        if (!cohort.weekSets.has(w)) {
          cohort.weekSets.set(w, new Set());
        }
        cohort.weekSets.get(w)!.add(v.visitor_id);
      }
    }

    const sortedWeeks = Array.from(cohortMap.keys()).sort();
    const cohorts: RetentionCohort[] = sortedWeeks.map((week) => {
      const cohort = cohortMap.get(week)!;
      const size = cohort.visitors.size;

      const retention: number[] = [];
      const weekIndex = sortedWeeks.indexOf(week);
      for (let i = 0; i < weeks && (weekIndex + i) < sortedWeeks.length; i++) {
        const targetWeek = sortedWeeks[weekIndex + i];
        const returnedCount = cohort.weekSets.get(targetWeek)?.size ?? 0;
        retention.push(size > 0 ? Math.round((returnedCount / size) * 1000) / 10 : 0);
      }

      return { week, size, retention };
    });

    return { cohorts };
  }

  // ─── Event Listing ──────────────────────────────────────

  async listEvents(params: EventListParams): Promise<EventListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const conditions: string[] = [`site_id = {siteId:String}`];
    const queryParams: Record<string, unknown> = { siteId: params.siteId, limit, offset };

    if (params.type) {
      conditions.push(`type = {type:String}`);
      queryParams.type = params.type;
    }
    if (params.eventName) {
      conditions.push(`event_name = {eventName:String}`);
      queryParams.eventName = params.eventName;
    }
    if (params.visitorId) {
      conditions.push(`visitor_id = {visitorId:String}`);
      queryParams.visitorId = params.visitorId;
    }
    if (params.userId) {
      conditions.push(`user_id = {userId:String}`);
      queryParams.userId = params.userId;
    }

    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      conditions.push(`timestamp >= {from:String} AND timestamp <= {to:String}`);
      queryParams.from = dateRange.from;
      queryParams.to = dateRange.to;
    }

    const where = conditions.join(' AND ');

    const [events, countRows] = await Promise.all([
      this.queryRows<Record<string, unknown>>(
        `SELECT event_id, type, timestamp, session_id, visitor_id, url, referrer, title,
                event_name, properties, user_id, traits, country, city, region,
                device_type, browser, os, language,
                utm_source, utm_medium, utm_campaign, utm_term, utm_content
         FROM ${EVENTS_TABLE}
         WHERE ${where}
         ORDER BY timestamp DESC
         LIMIT {limit:UInt32}
         OFFSET {offset:UInt32}`,
        queryParams,
      ),
      this.queryRows<{ total: string }>(
        `SELECT count() AS total FROM ${EVENTS_TABLE} WHERE ${where}`,
        queryParams,
      ),
    ]);

    return {
      events: events.map((e) => this.toEventListItem(e)),
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  // ─── User Listing ──────────────────────────────────────

  async listUsers(params: UserListParams): Promise<UserListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const conditions: string[] = [`site_id = {siteId:String}`];
    const queryParams: Record<string, unknown> = { siteId: params.siteId, limit, offset };

    if (params.search) {
      conditions.push(`(visitor_id ILIKE {search:String} OR user_id ILIKE {search:String})`);
      queryParams.search = `%${params.search}%`;
    }

    const where = conditions.join(' AND ');

    const [userRows, countRows] = await Promise.all([
      this.queryRows<Record<string, unknown>>(
        `SELECT
          visitor_id,
          anyLast(user_id) AS userId,
          anyLast(traits) AS traits,
          min(timestamp) AS firstSeen,
          max(timestamp) AS lastSeen,
          count() AS totalEvents,
          countIf(type = 'pageview') AS totalPageviews,
          uniq(session_id) AS totalSessions,
          anyLast(url) AS lastUrl,
          anyLast(device_type) AS device_type,
          anyLast(browser) AS browser,
          anyLast(os) AS os,
          anyLast(country) AS country,
          anyLast(city) AS city,
          anyLast(region) AS region,
          anyLast(language) AS language
        FROM ${EVENTS_TABLE}
        WHERE ${where}
        GROUP BY visitor_id
        ORDER BY lastSeen DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}`,
        queryParams,
      ),
      this.queryRows<{ total: string }>(
        `SELECT count() AS total FROM (
          SELECT visitor_id FROM ${EVENTS_TABLE}
          WHERE ${where}
          GROUP BY visitor_id
        )`,
        queryParams,
      ),
    ]);

    const users: UserDetail[] = userRows.map((u) => ({
      visitorId: String(u.visitor_id),
      userId: u.userId ? String(u.userId) : undefined,
      traits: this.parseJSON(u.traits as string | null),
      firstSeen: new Date(String(u.firstSeen)).toISOString(),
      lastSeen: new Date(String(u.lastSeen)).toISOString(),
      totalEvents: Number(u.totalEvents),
      totalPageviews: Number(u.totalPageviews),
      totalSessions: Number(u.totalSessions),
      lastUrl: u.lastUrl ? String(u.lastUrl) : undefined,
      device: u.device_type ? { type: String(u.device_type), browser: String(u.browser ?? ''), os: String(u.os ?? '') } : undefined,
      geo: u.country ? { country: String(u.country), city: u.city ? String(u.city) : undefined, region: u.region ? String(u.region) : undefined } : undefined,
      language: u.language ? String(u.language) : undefined,
    }));

    return {
      users,
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async getUserDetail(siteId: string, visitorId: string): Promise<UserDetail | null> {
    const result = await this.listUsers({ siteId, search: visitorId, limit: 1 });
    const user = result.users.find((u) => u.visitorId === visitorId);
    return user ?? null;
  }

  async getUserEvents(siteId: string, visitorId: string, params: EventListParams): Promise<EventListResult> {
    return this.listEvents({ ...params, siteId, visitorId });
  }

  // ─── Site Management ──────────────────────────────────────

  async createSite(data: CreateSiteRequest): Promise<Site> {
    const now = new Date().toISOString();
    const site: Site = {
      siteId: generateSiteId(),
      secretKey: generateSecretKey(),
      name: data.name,
      domain: data.domain,
      allowedOrigins: data.allowedOrigins,
      createdAt: now,
      updatedAt: now,
    };

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: site.siteId,
        secret_key: site.secretKey,
        name: site.name,
        domain: site.domain ?? null,
        allowed_origins: site.allowedOrigins ? JSON.stringify(site.allowedOrigins) : null,
        created_at: now,
        updated_at: now,
        version: 1,
        is_deleted: 0,
      }],
      format: 'JSONEachRow',
    });

    return site;
  }

  async getSite(siteId: string): Promise<Site | null> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, updated_at
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    return rows.length > 0 ? this.toSite(rows[0]) : null;
  }

  async getSiteBySecret(secretKey: string): Promise<Site | null> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, updated_at
       FROM ${SITES_TABLE} FINAL
       WHERE secret_key = {secretKey:String} AND is_deleted = 0`,
      { secretKey },
    );
    return rows.length > 0 ? this.toSite(rows[0]) : null;
  }

  async listSites(): Promise<Site[]> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, updated_at
       FROM ${SITES_TABLE} FINAL
       WHERE is_deleted = 0
       ORDER BY created_at DESC`,
      {},
    );
    return rows.map((r) => this.toSite(r));
  }

  async updateSite(siteId: string, data: UpdateSiteRequest): Promise<Site | null> {
    // Read current site with version
    const currentRows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, updated_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return null;

    const current = currentRows[0];
    const now = new Date().toISOString();
    const newVersion = Number(current.version) + 1;

    const newName = data.name !== undefined ? data.name : String(current.name);
    const newDomain = data.domain !== undefined ? (data.domain || null) : (current.domain ? String(current.domain) : null);
    const newOrigins = data.allowedOrigins !== undefined
      ? (data.allowedOrigins.length > 0 ? JSON.stringify(data.allowedOrigins) : null)
      : (current.allowed_origins ? String(current.allowed_origins) : null);

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: String(current.secret_key),
        name: newName,
        domain: newDomain,
        allowed_origins: newOrigins,
        created_at: String(current.created_at),
        updated_at: now,
        version: newVersion,
        is_deleted: 0,
      }],
      format: 'JSONEachRow',
    });

    return {
      siteId: String(current.site_id),
      secretKey: String(current.secret_key),
      name: newName,
      domain: newDomain ?? undefined,
      allowedOrigins: newOrigins ? JSON.parse(newOrigins) : undefined,
      createdAt: String(current.created_at),
      updatedAt: now,
    };
  }

  async deleteSite(siteId: string): Promise<boolean> {
    const currentRows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return false;

    const current = currentRows[0];
    const now = new Date().toISOString();

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: String(current.secret_key),
        name: String(current.name),
        domain: current.domain ? String(current.domain) : null,
        allowed_origins: current.allowed_origins ? String(current.allowed_origins) : null,
        created_at: String(current.created_at),
        updated_at: now,
        version: Number(current.version) + 1,
        is_deleted: 1,
      }],
      format: 'JSONEachRow',
    });

    return true;
  }

  async regenerateSecret(siteId: string): Promise<Site | null> {
    const currentRows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, created_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return null;

    const current = currentRows[0];
    const now = new Date().toISOString();
    const newSecret = generateSecretKey();

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: newSecret,
        name: String(current.name),
        domain: current.domain ? String(current.domain) : null,
        allowed_origins: current.allowed_origins ? String(current.allowed_origins) : null,
        created_at: String(current.created_at),
        updated_at: now,
        version: Number(current.version) + 1,
        is_deleted: 0,
      }],
      format: 'JSONEachRow',
    });

    return {
      siteId: String(current.site_id),
      secretKey: newSecret,
      name: String(current.name),
      domain: current.domain ? String(current.domain) : undefined,
      allowedOrigins: current.allowed_origins ? JSON.parse(String(current.allowed_origins)) : undefined,
      createdAt: String(current.created_at),
      updatedAt: now,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────

  private async queryRows<T>(query: string, query_params: Record<string, unknown>): Promise<T[]> {
    const result = await this.client.query({
      query,
      query_params,
      format: 'JSONEachRow',
    });
    return result.json<T>();
  }

  private toSite(row: Record<string, unknown>): Site {
    return {
      siteId: String(row.site_id),
      secretKey: String(row.secret_key),
      name: String(row.name),
      domain: row.domain ? String(row.domain) : undefined,
      allowedOrigins: row.allowed_origins ? JSON.parse(String(row.allowed_origins)) : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private toEventListItem(row: Record<string, unknown>): EventListItem {
    return {
      id: String(row.event_id ?? ''),
      type: String(row.type) as EventListItem['type'],
      timestamp: new Date(String(row.timestamp)).toISOString(),
      visitorId: String(row.visitor_id),
      sessionId: String(row.session_id),
      url: row.url ? String(row.url) : undefined,
      referrer: row.referrer ? String(row.referrer) : undefined,
      title: row.title ? String(row.title) : undefined,
      name: row.event_name ? String(row.event_name) : undefined,
      properties: this.parseJSON(row.properties as string | null),
      userId: row.user_id ? String(row.user_id) : undefined,
      traits: this.parseJSON(row.traits as string | null),
      geo: row.country ? {
        country: String(row.country),
        city: row.city ? String(row.city) : undefined,
        region: row.region ? String(row.region) : undefined,
      } : undefined,
      device: row.device_type ? {
        type: String(row.device_type),
        browser: String(row.browser ?? ''),
        os: String(row.os ?? ''),
      } : undefined,
      language: row.language ? String(row.language) : undefined,
      utm: row.utm_source ? {
        source: row.utm_source ? String(row.utm_source) : undefined,
        medium: row.utm_medium ? String(row.utm_medium) : undefined,
        campaign: row.utm_campaign ? String(row.utm_campaign) : undefined,
        term: row.utm_term ? String(row.utm_term) : undefined,
        content: row.utm_content ? String(row.utm_content) : undefined,
      } : undefined,
    };
  }

  private parseJSON(str: string | null | undefined): Record<string, unknown> | undefined {
    if (!str) return undefined;
    try {
      return JSON.parse(str);
    } catch {
      return undefined;
    }
  }
}
