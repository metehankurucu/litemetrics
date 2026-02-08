import type { DBAdapter, EnrichedEvent, QueryParams, QueryResult, QueryDataPoint, Granularity, TimeSeriesParams, TimeSeriesResult, RetentionParams, RetentionResult, RetentionCohort, Site, CreateSiteRequest, UpdateSiteRequest, EventListParams, EventListResult, EventListItem, UserListParams, UserListResult, UserDetail } from '@litemetrics/core';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { resolvePeriod, previousPeriodRange, autoGranularity, fillBuckets, granularityToDateFormat, getISOWeek, generateSiteId, generateSecretKey } from './utils';

const EVENTS_TABLE = 'litemetrics_events';
const SITES_TABLE = 'litemetrics_sites';
const IDENTITY_MAP_TABLE = 'litemetrics_identity_map';

const CREATE_IDENTITY_MAP_TABLE = `
CREATE TABLE IF NOT EXISTS ${IDENTITY_MAP_TABLE} (
    site_id        LowCardinality(String),
    visitor_id     String,
    user_id        String,
    identified_at  DateTime64(3),
    created_at     DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(created_at)
  ORDER BY (site_id, visitor_id)
  SETTINGS index_granularity = 8192
`;

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
    event_source   LowCardinality(Nullable(String)),
    event_subtype  LowCardinality(Nullable(String)),
    page_path      Nullable(String),
    target_url_path Nullable(String),
    element_selector Nullable(String),
    element_text   Nullable(String),
    scroll_depth_pct Nullable(UInt8),
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
    conversion_events Nullable(String),
    created_at       DateTime64(3),
    updated_at       DateTime64(3),
    version          UInt64,
    is_deleted       UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(version)
  ORDER BY (site_id)
  SETTINGS index_granularity = 8192
`;

/** Convert JS date/ISO string to ClickHouse DateTime64 format: '2026-02-07 14:22:08.339' */
function toCHDateTime(d: string | Date): string {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return iso.replace('T', ' ').replace('Z', '');
}

/** ClickHouse multiIf expression that normalizes utm_source abbreviations */
function normalizedUtmSourceExpr(): string {
  return `multiIf(
    lower(utm_source) IN ('ig','instagram','instagram.com'), 'Instagram',
    lower(utm_source) IN ('fb','facebook','facebook.com','fb.com'), 'Facebook',
    lower(utm_source) IN ('tw','twitter','twitter.com','x','x.com','t.co'), 'X (Twitter)',
    lower(utm_source) IN ('li','linkedin','linkedin.com'), 'LinkedIn',
    lower(utm_source) IN ('yt','youtube','youtube.com'), 'YouTube',
    lower(utm_source) IN ('goog','google','google.com'), 'Google',
    lower(utm_source) IN ('gh','github','github.com'), 'GitHub',
    lower(utm_source) IN ('reddit','reddit.com'), 'Reddit',
    lower(utm_source) IN ('pinterest','pinterest.com'), 'Pinterest',
    lower(utm_source) IN ('tiktok','tiktok.com'), 'TikTok',
    lower(utm_source) IN ('openai','chatgpt','chat.openai.com'), 'OpenAI',
    lower(utm_source) IN ('perplexity','perplexity.ai'), 'Perplexity',
    utm_source
  )`;
}

/** ClickHouse multiIf expression that normalizes utm_medium values */
function normalizedUtmMediumExpr(): string {
  return `multiIf(
    lower(utm_medium) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid'), 'Paid',
    lower(utm_medium) IN ('organic'), 'Organic',
    lower(utm_medium) IN ('social','social-media','social_media'), 'Social',
    lower(utm_medium) IN ('email','e-mail','e_mail'), 'Email',
    lower(utm_medium) IN ('display','banner','cpm'), 'Display',
    lower(utm_medium) IN ('affiliate'), 'Affiliate',
    lower(utm_medium) IN ('referral'), 'Referral',
    utm_medium
  )`;
}

/** ClickHouse multiIf expression for channel classification (Plausible-style) */
function channelClassificationExpr(): string {
  return `multiIf(
    lower(ifNull(utm_medium,'')) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')
      AND (lower(ifNull(utm_source,'')) IN ('google','goog','bing','yahoo','duckduckgo','ecosia','baidu','yandex')
           OR multiSearchAnyCaseInsensitive(ifNull(referrer,''), ['google','bing','yahoo','duckduckgo','ecosia','baidu','yandex','search.brave']) > 0),
    'Paid Search',
    lower(ifNull(utm_medium,'')) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')
      AND (lower(ifNull(utm_source,'')) IN ('instagram','ig','facebook','fb','twitter','tw','x','linkedin','li','youtube','yt','tiktok','pinterest','reddit','snapchat')
           OR multiSearchAnyCaseInsensitive(ifNull(referrer,''), ['instagram','facebook','twitter','x.com','t.co','linkedin','youtube','tiktok','pinterest','reddit','snapchat']) > 0),
    'Paid Social',
    lower(ifNull(utm_medium,'')) IN ('email','e-mail','e_mail'),
    'Email',
    lower(ifNull(utm_medium,'')) IN ('display','banner','cpm'),
    'Display',
    lower(ifNull(utm_medium,'')) IN ('affiliate'),
    'Affiliate',
    multiSearchAnyCaseInsensitive(ifNull(referrer,''), ['google','bing','yahoo','duckduckgo','ecosia','baidu','yandex','search.brave']) > 0
      AND (ifNull(utm_medium,'') = '' OR lower(utm_medium) NOT IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')),
    'Organic Search',
    (multiSearchAnyCaseInsensitive(ifNull(referrer,''), ['instagram','facebook','twitter','x.com','t.co','linkedin','youtube','tiktok','pinterest','reddit','snapchat','mastodon','tumblr']) > 0
     OR lower(ifNull(utm_source,'')) IN ('instagram','ig','facebook','fb','twitter','tw','x','linkedin','li','youtube','yt','tiktok','pinterest','reddit','snapchat'))
      AND (ifNull(utm_medium,'') = '' OR lower(utm_medium) NOT IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')),
    'Organic Social',
    ifNull(referrer,'') != '' AND length(ifNull(referrer,'')) > 0,
    'Referral',
    (ifNull(utm_source,'') != '' OR ifNull(utm_medium,'') != '' OR ifNull(utm_campaign,'') != ''),
    'Other',
    'Direct'
  )`;
}

function buildFilterConditions(filters?: Record<string, string>): { conditions: string[]; params: Record<string, unknown> } {
  if (!filters) return { conditions: [], params: {} };
  const map: Record<string, string> = {
    'geo.country': 'country',
    'geo.city': 'city',
    'geo.region': 'region',
    'language': 'language',
    'device.type': 'device_type',
    'device.browser': 'browser',
    'device.os': 'os',
    'utm.source': 'utm_source',
    'utm.medium': 'utm_medium',
    'utm.campaign': 'utm_campaign',
    'utm.term': 'utm_term',
    'utm.content': 'utm_content',
    'referrer': 'referrer',
    'event_source': 'event_source',
    'event_subtype': 'event_subtype',
    'page_path': 'page_path',
    'target_url_path': 'target_url_path',
    'event_name': 'event_name',
    'type': 'type',
  };
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    // Special handling for channel filter (computed expression, not a column)
    if (key === 'channel') {
      const paramKey = 'f_channel';
      conditions.push(`${channelClassificationExpr()} = {${paramKey}:String}`);
      params[paramKey] = value;
      continue;
    }
    if (!map[key]) continue;
    const paramKey = `f_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    conditions.push(`${map[key]} = {${paramKey}:String}`);
    params[paramKey] = value;
  }
  return { conditions, params };
}

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
    await this.client.command({ query: CREATE_IDENTITY_MAP_TABLE });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS event_source LowCardinality(Nullable(String))` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS event_subtype LowCardinality(Nullable(String))` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS page_path Nullable(String)` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS target_url_path Nullable(String)` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS element_selector Nullable(String)` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS element_text Nullable(String)` });
    await this.client.command({ query: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN IF NOT EXISTS scroll_depth_pct Nullable(UInt8)` });
    await this.client.command({
      query: `ALTER TABLE ${SITES_TABLE} ADD COLUMN IF NOT EXISTS conversion_events Nullable(String)`,
    });
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
      timestamp: toCHDateTime(new Date(e.timestamp)),
      session_id: e.sessionId,
      visitor_id: e.visitorId,
      url: e.url ?? null,
      referrer: e.referrer ?? null,
      title: e.title ?? null,
      event_name: e.name ?? null,
      properties: e.properties ? JSON.stringify(e.properties) : null,
      event_source: e.eventSource ?? null,
      event_subtype: e.eventSubtype ?? null,
      page_path: e.pagePath ?? null,
      target_url_path: e.targetUrlPath ?? null,
      element_selector: e.elementSelector ?? null,
      element_text: e.elementText ?? null,
      scroll_depth_pct: e.scrollDepthPct ?? null,
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
      from: toCHDateTime(dateRange.from),
      to: toCHDateTime(dateRange.to),
      limit,
    };
    const filter = buildFilterConditions(q.filters);
    const filterSql = filter.conditions.length > 0 ? ` AND ${filter.conditions.join(' AND ')}` : '';

    let data: QueryDataPoint[] = [];
    let total = 0;

    switch (q.metric) {
      case 'pageviews': {
        const rows = await this.queryRows<{ value: string }>(
          `SELECT count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'pageview'${filterSql}`,
          { ...params, ...filter.params },
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
             AND timestamp <= {to:String}${filterSql}`,
          { ...params, ...filter.params },
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
             AND timestamp <= {to:String}${filterSql}`,
          { ...params, ...filter.params },
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
             AND type = 'event'${filterSql}`,
          { ...params, ...filter.params },
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'events', value: total }];
        break;
      }
      case 'conversions': {
        const conversionEvents = q.conversionEvents ?? [];
        if (conversionEvents.length === 0) {
          total = 0;
          data = [{ key: 'conversions', value: 0 }];
          break;
        }
        const rows = await this.queryRows<{ value: string }>(
          `SELECT count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_name IN {eventNames:Array(String)}${filterSql}`,
          { ...params, eventNames: conversionEvents, ...filter.params },
        );
        total = Number(rows[0]?.value ?? 0);
        data = [{ key: 'conversions', value: total }];
        break;
      }

      case 'top_pages': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT url AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'pageview'
             AND url IS NOT NULL${filterSql}
           GROUP BY url
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             AND referrer != ''${filterSql}
           GROUP BY referrer
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             AND country IS NOT NULL${filterSql}
           GROUP BY country
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             AND city IS NOT NULL${filterSql}
           GROUP BY city
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             ${filterSql}
           GROUP BY event_name
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_conversions': {
        const conversionEvents = q.conversionEvents ?? [];
        if (conversionEvents.length === 0) {
          total = 0;
          data = [];
          break;
        }
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT event_name AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_name IN {eventNames:Array(String)}
             ${filterSql}
           GROUP BY event_name
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, eventNames: conversionEvents, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_exit_pages': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT exit_url AS key, count() AS value FROM (
             SELECT session_id, argMax(url, timestamp) AS exit_url
             FROM ${EVENTS_TABLE}
             WHERE site_id = {siteId:String}
               AND timestamp >= {from:String}
               AND timestamp <= {to:String}
               AND type = 'pageview'
               AND url IS NOT NULL${filterSql}
             GROUP BY session_id
           )
           GROUP BY exit_url
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_transitions': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT concat(prev_url, ' → ', curr_url) AS key, count() AS value FROM (
             SELECT session_id, url AS curr_url,
                    lagInFrame(url, 1) OVER (PARTITION BY session_id ORDER BY timestamp ASC) AS prev_url
             FROM ${EVENTS_TABLE}
             WHERE site_id = {siteId:String}
               AND timestamp >= {from:String}
               AND timestamp <= {to:String}
               AND type = 'pageview'
               AND url IS NOT NULL${filterSql}
           )
           WHERE prev_url IS NOT NULL AND prev_url != ''
           GROUP BY key
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_scroll_pages': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT page_path AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_subtype = 'scroll_depth'
             AND page_path IS NOT NULL${filterSql}
           GROUP BY page_path
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_button_clicks': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT ifNull(element_text, element_selector) AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_subtype = 'button_click'
             AND (element_text IS NOT NULL OR element_selector IS NOT NULL)${filterSql}
           GROUP BY key
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_link_targets': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT target_url_path AS key, count() AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND type = 'event'
             AND event_subtype IN ('link_click','outbound_click')
             AND target_url_path IS NOT NULL${filterSql}
           GROUP BY target_url_path
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             ${filterSql}
           GROUP BY device_type
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             ${filterSql}
           GROUP BY browser
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
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
             ${filterSql}
           GROUP BY os
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_sources': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT ${normalizedUtmSourceExpr()} AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND utm_source IS NOT NULL AND utm_source != ''
             ${filterSql}
           GROUP BY key
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_mediums': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT ${normalizedUtmMediumExpr()} AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND utm_medium IS NOT NULL AND utm_medium != ''
             ${filterSql}
           GROUP BY key
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_campaigns': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT utm_campaign AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND utm_campaign IS NOT NULL AND utm_campaign != ''
             ${filterSql}
           GROUP BY utm_campaign
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_terms': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT utm_term AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND utm_term IS NOT NULL AND utm_term != ''
             ${filterSql}
           GROUP BY utm_term
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_contents': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT utm_content AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             AND utm_content IS NOT NULL AND utm_content != ''
             ${filterSql}
           GROUP BY utm_content
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_channels': {
        const rows = await this.queryRows<{ key: string; value: string }>(
          `SELECT ${channelClassificationExpr()} AS key, uniq(visitor_id) AS value FROM ${EVENTS_TABLE}
           WHERE site_id = {siteId:String}
             AND timestamp >= {from:String}
             AND timestamp <= {to:String}
             ${filterSql}
           GROUP BY key
           ORDER BY value DESC
           LIMIT {limit:UInt32}`,
          { ...params, ...filter.params },
        );
        data = rows.map((r) => ({ key: r.key, value: Number(r.value) }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
    }

    const result: QueryResult = { metric: q.metric, period, data, total };

    // Comparison with previous period
    if (q.compare && ['pageviews', 'visitors', 'sessions', 'events', 'conversions'].includes(q.metric)) {
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

    const filter = buildFilterConditions(params.filters);
    const filterSql = filter.conditions.length > 0 ? ` AND ${filter.conditions.join(' AND ')}` : '';
    const typeFilter = params.metric === 'pageviews' ? `AND type = 'pageview'` : '';
    const eventsFilter = params.metric === 'events' ? `AND type = 'event'` : '';
    const conversionsFilter = params.metric === 'conversions'
      ? `AND type = 'event' AND event_name IN {eventNames:Array(String)}`
      : '';
    const extraFilters = [typeFilter, eventsFilter, conversionsFilter, filterSql].filter(Boolean).join(' ');

    let sql: string;
    if (params.metric === 'visitors' || params.metric === 'sessions') {
      const field = params.metric === 'visitors' ? 'visitor_id' : 'session_id';
      sql = `
        SELECT ${bucketFn} AS bucket, uniq(${field}) AS value
        FROM ${EVENTS_TABLE}
        WHERE site_id = {siteId:String}
          AND timestamp >= {from:String}
          AND timestamp <= {to:String}
          ${extraFilters}
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
          ${extraFilters}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
    }

    const rows = await this.queryRows<{ bucket: string; value: string }>(sql, {
      siteId: params.siteId,
      from: toCHDateTime(dateRange.from),
      to: toCHDateTime(dateRange.to),
      eventNames: params.conversionEvents ?? [],
      ...filter.params,
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
        since: toCHDateTime(startDate),
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
    if (params.eventSource) {
      conditions.push(`event_source = {eventSource:String}`);
      queryParams.eventSource = params.eventSource;
    }
    if (params.eventNames && params.eventNames.length > 0) {
      conditions.push(`event_name IN {eventNames:Array(String)}`);
      queryParams.eventNames = params.eventNames;
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
      queryParams.from = toCHDateTime(dateRange.from);
      queryParams.to = toCHDateTime(dateRange.to);
    }

    const where = conditions.join(' AND ');

    const [events, countRows] = await Promise.all([
      this.queryRows<Record<string, unknown>>(
        `SELECT event_id, type, timestamp, session_id, visitor_id, url, referrer, title,
                event_name, properties, event_source, event_subtype, page_path, target_url_path,
                element_selector, element_text, scroll_depth_pct,
                user_id, traits, country, city, region,
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
        `WITH identity AS (
          SELECT visitor_id, user_id
          FROM ${IDENTITY_MAP_TABLE} FINAL
          WHERE site_id = {siteId:String}
        )
        SELECT
          if(i.user_id IS NOT NULL AND i.user_id != '', i.user_id, e.visitor_id) AS group_key,
          anyLast(e.visitor_id) AS visitor_id,
          anyLast(i.user_id) AS userId,
          anyLast(e.traits) AS traits,
          min(e.timestamp) AS firstSeen,
          max(e.timestamp) AS lastSeen,
          count() AS totalEvents,
          countIf(e.type = 'pageview') AS totalPageviews,
          uniq(e.session_id) AS totalSessions,
          anyLast(e.url) AS lastUrl,
          anyLast(e.referrer) AS referrer,
          anyLast(e.device_type) AS device_type,
          anyLast(e.browser) AS browser,
          anyLast(e.os) AS os,
          anyLast(e.country) AS country,
          anyLast(e.city) AS city,
          anyLast(e.region) AS region,
          anyLast(e.language) AS language,
          anyLast(e.timezone) AS timezone,
          anyLast(e.screen_width) AS screen_width,
          anyLast(e.screen_height) AS screen_height,
          anyLast(e.utm_source) AS utm_source,
          anyLast(e.utm_medium) AS utm_medium,
          anyLast(e.utm_campaign) AS utm_campaign,
          anyLast(e.utm_term) AS utm_term,
          anyLast(e.utm_content) AS utm_content
        FROM ${EVENTS_TABLE} e
        LEFT JOIN identity i ON e.visitor_id = i.visitor_id
        WHERE e.site_id = {siteId:String}${where.includes('ILIKE') ? ` AND (e.visitor_id ILIKE {search:String} OR i.user_id ILIKE {search:String})` : ''}
        GROUP BY group_key
        ORDER BY lastSeen DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}`,
        queryParams,
      ),
      this.queryRows<{ total: string }>(
        `WITH identity AS (
          SELECT visitor_id, user_id
          FROM ${IDENTITY_MAP_TABLE} FINAL
          WHERE site_id = {siteId:String}
        )
        SELECT count() AS total FROM (
          SELECT if(i.user_id IS NOT NULL AND i.user_id != '', i.user_id, e.visitor_id) AS group_key
          FROM ${EVENTS_TABLE} e
          LEFT JOIN identity i ON e.visitor_id = i.visitor_id
          WHERE e.site_id = {siteId:String}${where.includes('ILIKE') ? ` AND (e.visitor_id ILIKE {search:String} OR i.user_id ILIKE {search:String})` : ''}
          GROUP BY group_key
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
      referrer: u.referrer ? String(u.referrer) : undefined,
      device: u.device_type ? { type: String(u.device_type), browser: String(u.browser ?? ''), os: String(u.os ?? '') } : undefined,
      geo: u.country ? { country: String(u.country), city: u.city ? String(u.city) : undefined, region: u.region ? String(u.region) : undefined } : undefined,
      language: u.language ? String(u.language) : undefined,
      timezone: u.timezone ? String(u.timezone) : undefined,
      screen: (u.screen_width || u.screen_height) ? { width: Number(u.screen_width ?? 0), height: Number(u.screen_height ?? 0) } : undefined,
      utm: u.utm_source ? {
        source: String(u.utm_source),
        medium: u.utm_medium ? String(u.utm_medium) : undefined,
        campaign: u.utm_campaign ? String(u.utm_campaign) : undefined,
        term: u.utm_term ? String(u.utm_term) : undefined,
        content: u.utm_content ? String(u.utm_content) : undefined,
      } : undefined,
    }));

    return {
      users,
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null> {
    // Try as userId first (check identity map)
    const visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length > 0) {
      return this.getMergedUserDetail(siteId, identifier, visitorIds);
    }
    // Try as visitorId — check if it has a known userId
    const userId = await this.getUserIdForVisitor(siteId, identifier);
    if (userId) {
      const allVisitorIds = await this.getVisitorIdsForUser(siteId, userId);
      return this.getMergedUserDetail(siteId, userId, allVisitorIds.length > 0 ? allVisitorIds : [identifier]);
    }
    // Pure anonymous — single visitorId
    const result = await this.listUsers({ siteId, search: identifier, limit: 1 });
    const user = result.users.find((u) => u.visitorId === identifier);
    return user ?? null;
  }

  async getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult> {
    // Resolve all linked visitorIds
    const visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length > 0) {
      return this.listEventsForVisitorIds(siteId, visitorIds, params);
    }
    // Check if identifier is a visitorId with a known userId
    const userId = await this.getUserIdForVisitor(siteId, identifier);
    if (userId) {
      const allVisitorIds = await this.getVisitorIdsForUser(siteId, userId);
      if (allVisitorIds.length > 0) {
        return this.listEventsForVisitorIds(siteId, allVisitorIds, params);
      }
    }
    // Pure anonymous — single visitorId
    return this.listEvents({ ...params, siteId, visitorId: identifier });
  }

  // ─── Identity Mapping ──────────────────────────────────────

  async upsertIdentity(siteId: string, visitorId: string, userId: string): Promise<void> {
    await this.client.insert({
      table: IDENTITY_MAP_TABLE,
      values: [{
        site_id: siteId,
        visitor_id: visitorId,
        user_id: userId,
        identified_at: toCHDateTime(new Date()),
      }],
      format: 'JSONEachRow',
    });
  }

  async getVisitorIdsForUser(siteId: string, userId: string): Promise<string[]> {
    const rows = await this.queryRows<{ visitor_id: string }>(
      `SELECT visitor_id FROM ${IDENTITY_MAP_TABLE} FINAL
       WHERE site_id = {siteId:String} AND user_id = {userId:String}`,
      { siteId, userId },
    );
    return rows.map((r) => r.visitor_id);
  }

  async getUserIdForVisitor(siteId: string, visitorId: string): Promise<string | null> {
    const rows = await this.queryRows<{ user_id: string }>(
      `SELECT user_id FROM ${IDENTITY_MAP_TABLE} FINAL
       WHERE site_id = {siteId:String} AND visitor_id = {visitorId:String}
       LIMIT 1`,
      { siteId, visitorId },
    );
    return rows.length > 0 ? rows[0].user_id : null;
  }

  private async getMergedUserDetail(siteId: string, userId: string, visitorIds: string[]): Promise<UserDetail | null> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT
        anyLast(visitor_id) AS last_visitor_id,
        anyLast(traits) AS traits,
        min(timestamp) AS firstSeen,
        max(timestamp) AS lastSeen,
        count() AS totalEvents,
        countIf(type = 'pageview') AS totalPageviews,
        uniq(session_id) AS totalSessions,
        anyLast(url) AS lastUrl,
        anyLast(referrer) AS referrer,
        anyLast(device_type) AS device_type,
        anyLast(browser) AS browser,
        anyLast(os) AS os,
        anyLast(country) AS country,
        anyLast(city) AS city,
        anyLast(region) AS region,
        anyLast(language) AS language,
        anyLast(timezone) AS timezone,
        anyLast(screen_width) AS screen_width,
        anyLast(screen_height) AS screen_height,
        anyLast(utm_source) AS utm_source,
        anyLast(utm_medium) AS utm_medium,
        anyLast(utm_campaign) AS utm_campaign,
        anyLast(utm_term) AS utm_term,
        anyLast(utm_content) AS utm_content
      FROM ${EVENTS_TABLE}
      WHERE site_id = {siteId:String}
        AND visitor_id IN {visitorIds:Array(String)}`,
      { siteId, visitorIds },
    );
    if (rows.length === 0) return null;
    const u = rows[0];
    return {
      visitorId: String(u.last_visitor_id),
      visitorIds,
      userId,
      traits: this.parseJSON(u.traits as string | null),
      firstSeen: new Date(String(u.firstSeen)).toISOString(),
      lastSeen: new Date(String(u.lastSeen)).toISOString(),
      totalEvents: Number(u.totalEvents),
      totalPageviews: Number(u.totalPageviews),
      totalSessions: Number(u.totalSessions),
      lastUrl: u.lastUrl ? String(u.lastUrl) : undefined,
      referrer: u.referrer ? String(u.referrer) : undefined,
      device: u.device_type ? { type: String(u.device_type), browser: String(u.browser ?? ''), os: String(u.os ?? '') } : undefined,
      geo: u.country ? { country: String(u.country), city: u.city ? String(u.city) : undefined, region: u.region ? String(u.region) : undefined } : undefined,
      language: u.language ? String(u.language) : undefined,
      timezone: u.timezone ? String(u.timezone) : undefined,
      screen: (u.screen_width || u.screen_height) ? { width: Number(u.screen_width ?? 0), height: Number(u.screen_height ?? 0) } : undefined,
      utm: u.utm_source ? {
        source: String(u.utm_source),
        medium: u.utm_medium ? String(u.utm_medium) : undefined,
        campaign: u.utm_campaign ? String(u.utm_campaign) : undefined,
        term: u.utm_term ? String(u.utm_term) : undefined,
        content: u.utm_content ? String(u.utm_content) : undefined,
      } : undefined,
    };
  }

  private async listEventsForVisitorIds(siteId: string, visitorIds: string[], params: EventListParams): Promise<EventListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const conditions: string[] = [`site_id = {siteId:String}`, `visitor_id IN {visitorIds:Array(String)}`];
    const queryParams: Record<string, unknown> = { siteId, visitorIds, limit, offset };

    if (params.type) {
      conditions.push(`type = {type:String}`);
      queryParams.type = params.type;
    }
    if (params.eventName) {
      conditions.push(`event_name = {eventName:String}`);
      queryParams.eventName = params.eventName;
    }
    if (params.eventNames && params.eventNames.length > 0) {
      conditions.push(`event_name IN {eventNames:Array(String)}`);
      queryParams.eventNames = params.eventNames;
    }
    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      conditions.push(`timestamp >= {from:String} AND timestamp <= {to:String}`);
      queryParams.from = toCHDateTime(dateRange.from);
      queryParams.to = toCHDateTime(dateRange.to);
    }

    const where = conditions.join(' AND ');

    const [events, countRows] = await Promise.all([
      this.queryRows<Record<string, unknown>>(
        `SELECT event_id, type, timestamp, session_id, visitor_id, url, referrer, title,
                event_name, properties, event_source, event_subtype, page_path, target_url_path,
                element_selector, element_text, scroll_depth_pct,
                user_id, traits, country, city, region,
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

  // ─── Site Management ──────────────────────────────────────

  async createSite(data: CreateSiteRequest): Promise<Site> {
    const now = new Date();
    const nowISO = now.toISOString();
    const nowCH = toCHDateTime(now);
    const site: Site = {
      siteId: generateSiteId(),
      secretKey: generateSecretKey(),
      name: data.name,
      domain: data.domain,
      allowedOrigins: data.allowedOrigins,
      conversionEvents: data.conversionEvents,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: site.siteId,
        secret_key: site.secretKey,
        name: site.name,
        domain: site.domain ?? null,
        allowed_origins: site.allowedOrigins ? JSON.stringify(site.allowedOrigins) : null,
        conversion_events: site.conversionEvents ? JSON.stringify(site.conversionEvents) : null,
        created_at: nowCH,
        updated_at: nowCH,
        version: 1,
        is_deleted: 0,
      }],
      format: 'JSONEachRow',
    });

    return site;
  }

  async getSite(siteId: string): Promise<Site | null> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, updated_at
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    return rows.length > 0 ? this.toSite(rows[0]) : null;
  }

  async getSiteBySecret(secretKey: string): Promise<Site | null> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, updated_at
       FROM ${SITES_TABLE} FINAL
       WHERE secret_key = {secretKey:String} AND is_deleted = 0`,
      { secretKey },
    );
    return rows.length > 0 ? this.toSite(rows[0]) : null;
  }

  async listSites(): Promise<Site[]> {
    const rows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, updated_at
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
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, updated_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return null;

    const current = currentRows[0];
    const now = new Date();
    const nowISO = now.toISOString();
    const nowCH = toCHDateTime(now);
    const newVersion = Number(current.version) + 1;

    const newName = data.name !== undefined ? data.name : String(current.name);
    const newDomain = data.domain !== undefined ? (data.domain || null) : (current.domain ? String(current.domain) : null);
    const newOrigins = data.allowedOrigins !== undefined
      ? (data.allowedOrigins.length > 0 ? JSON.stringify(data.allowedOrigins) : null)
      : (current.allowed_origins ? String(current.allowed_origins) : null);
    const newConversions = data.conversionEvents !== undefined
      ? (data.conversionEvents.length > 0 ? JSON.stringify(data.conversionEvents) : null)
      : (current.conversion_events ? String(current.conversion_events) : null);

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: String(current.secret_key),
        name: newName,
        domain: newDomain,
        allowed_origins: newOrigins,
        conversion_events: newConversions,
        created_at: toCHDateTime(String(current.created_at)),
        updated_at: nowCH,
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
      conversionEvents: newConversions ? JSON.parse(newConversions) : undefined,
      createdAt: String(current.created_at),
      updatedAt: nowISO,
    };
  }

  async deleteSite(siteId: string): Promise<boolean> {
    const currentRows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return false;

    const current = currentRows[0];
    const nowCH = toCHDateTime(new Date());

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: String(current.secret_key),
        name: String(current.name),
        domain: current.domain ? String(current.domain) : null,
        allowed_origins: current.allowed_origins ? String(current.allowed_origins) : null,
        conversion_events: current.conversion_events ? String(current.conversion_events) : null,
        created_at: toCHDateTime(String(current.created_at)),
        updated_at: nowCH,
        version: Number(current.version) + 1,
        is_deleted: 1,
      }],
      format: 'JSONEachRow',
    });

    return true;
  }

  async regenerateSecret(siteId: string): Promise<Site | null> {
    const currentRows = await this.queryRows<Record<string, unknown>>(
      `SELECT site_id, secret_key, name, domain, allowed_origins, conversion_events, created_at, version
       FROM ${SITES_TABLE} FINAL
       WHERE site_id = {siteId:String} AND is_deleted = 0`,
      { siteId },
    );
    if (currentRows.length === 0) return null;

    const current = currentRows[0];
    const now = new Date();
    const nowISO = now.toISOString();
    const nowCH = toCHDateTime(now);
    const newSecret = generateSecretKey();

    await this.client.insert({
      table: SITES_TABLE,
      values: [{
        site_id: String(current.site_id),
        secret_key: newSecret,
        name: String(current.name),
        domain: current.domain ? String(current.domain) : null,
        allowed_origins: current.allowed_origins ? String(current.allowed_origins) : null,
        conversion_events: current.conversion_events ? String(current.conversion_events) : null,
        created_at: toCHDateTime(String(current.created_at)),
        updated_at: nowCH,
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
      conversionEvents: current.conversion_events ? JSON.parse(String(current.conversion_events)) : undefined,
      createdAt: String(current.created_at),
      updatedAt: nowISO,
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
      conversionEvents: row.conversion_events ? JSON.parse(String(row.conversion_events)) : undefined,
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
      eventSource: row.event_source ? String(row.event_source) as EventListItem['eventSource'] : undefined,
      eventSubtype: row.event_subtype ? String(row.event_subtype) as EventListItem['eventSubtype'] : undefined,
      pagePath: row.page_path ? String(row.page_path) : undefined,
      targetUrlPath: row.target_url_path ? String(row.target_url_path) : undefined,
      elementSelector: row.element_selector ? String(row.element_selector) : undefined,
      elementText: row.element_text ? String(row.element_text) : undefined,
      scrollDepthPct: row.scroll_depth_pct !== null && row.scroll_depth_pct !== undefined ? Number(row.scroll_depth_pct) : undefined,
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
