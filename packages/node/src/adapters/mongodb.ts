import type { DBAdapter, EnrichedEvent, QueryParams, QueryResult, QueryDataPoint, TimeSeriesParams, TimeSeriesResult, RetentionParams, RetentionResult, RetentionCohort, Site, CreateSiteRequest, UpdateSiteRequest, EventListParams, EventListResult, EventListItem, UserListParams, UserListResult, UserDetail } from '@litemetrics/core';
import { MongoClient, type Collection, type Db } from 'mongodb';
import { resolvePeriod, previousPeriodRange, autoGranularity, granularityToDateFormat, fillBuckets, getISOWeek, generateSiteId, generateSecretKey } from './utils';

interface EventDocument {
  site_id: string;
  type: string;
  timestamp: Date;
  session_id: string;
  visitor_id: string;
  url: string | null;
  referrer: string | null;
  title: string | null;
  event_name: string | null;
  properties: Record<string, unknown> | null;
  event_source: string | null;
  event_subtype: string | null;
  page_path: string | null;
  target_url_path: string | null;
  element_selector: string | null;
  element_text: string | null;
  scroll_depth_pct: number | null;
  user_id: string | null;
  traits: Record<string, unknown> | null;
  country: string | null;
  city: string | null;
  region: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  language: string | null;
  timezone: string | null;
  screen_width: number | null;
  screen_height: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  ip: string | null;
  created_at: Date;
}

interface SiteDocument {
  site_id: string;
  secret_key: string;
  name: string;
  domain: string | null;
  allowed_origins: string[] | null;
  conversion_events: string[] | null;
  created_at: Date;
  updated_at: Date;
}

interface IdentityMapDocument {
  site_id: string;
  visitor_id: string;
  user_id: string;
  identified_at: Date;
  created_at: Date;
}

const EVENTS_COLLECTION = 'litemetrics_events';
const SITES_COLLECTION = 'litemetrics_sites';
const IDENTITY_MAP_COLLECTION = 'litemetrics_identity_map';

function buildFilterMatch(filters?: Record<string, string>): Record<string, unknown> {
  if (!filters) return {};
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
  const match: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!value || !map[key]) continue;
    match[map[key]] = value;
  }
  return match;
}

export class MongoDBAdapter implements DBAdapter {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<EventDocument>;
  private sites!: Collection<SiteDocument>;
  private identityMap!: Collection<IdentityMapDocument>;

  constructor(url: string) {
    this.client = new MongoClient(url);
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db();
    this.collection = this.db.collection<EventDocument>(EVENTS_COLLECTION);
    this.sites = this.db.collection<SiteDocument>(SITES_COLLECTION);
    this.identityMap = this.db.collection<IdentityMapDocument>(IDENTITY_MAP_COLLECTION);

    await Promise.all([
      this.collection.createIndex({ site_id: 1, timestamp: -1 }),
      this.collection.createIndex({ site_id: 1, type: 1 }),
      this.collection.createIndex({ site_id: 1, visitor_id: 1 }),
      this.collection.createIndex({ site_id: 1, session_id: 1 }),
      this.sites.createIndex({ site_id: 1 }, { unique: true }),
      this.sites.createIndex({ secret_key: 1 }),
      this.identityMap.createIndex({ site_id: 1, visitor_id: 1 }, { unique: true }),
      this.identityMap.createIndex({ site_id: 1, user_id: 1 }),
    ]);
  }

  async insertEvents(events: EnrichedEvent[]): Promise<void> {
    if (events.length === 0) return;

    const docs: EventDocument[] = events.map((e) => ({
      site_id: e.siteId,
      type: e.type,
      timestamp: new Date(e.timestamp),
      session_id: e.sessionId,
      visitor_id: e.visitorId,
      url: e.url ?? null,
      referrer: e.referrer ?? null,
      title: e.title ?? null,
      event_name: e.name ?? null,
      properties: e.properties ?? null,
      event_source: e.eventSource ?? null,
      event_subtype: e.eventSubtype ?? null,
      page_path: e.pagePath ?? null,
      target_url_path: e.targetUrlPath ?? null,
      element_selector: e.elementSelector ?? null,
      element_text: e.elementText ?? null,
      scroll_depth_pct: e.scrollDepthPct ?? null,
      user_id: e.userId ?? null,
      traits: e.traits ?? null,
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
      created_at: new Date(),
    }));

    await this.collection.insertMany(docs);
  }

  async query(q: QueryParams): Promise<QueryResult> {
    const { dateRange, period } = resolvePeriod(q);
    const siteId = q.siteId;
    const limit = q.limit ?? 10;

    const baseMatch = {
      site_id: siteId,
      timestamp: { $gte: new Date(dateRange.from), $lte: new Date(dateRange.to) },
    };
    const filterMatch = buildFilterMatch(q.filters);

    let data: QueryDataPoint[] = [];
    let total = 0;

    switch (q.metric) {
      case 'pageviews': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'pageview' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'pageviews', value: total }];
        break;
      }

      case 'visitors': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, ...filterMatch } },
          { $group: { _id: '$visitor_id' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'visitors', value: total }];
        break;
      }

      case 'sessions': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, ...filterMatch } },
          { $group: { _id: '$session_id' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'sessions', value: total }];
        break;
      }

      case 'events': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'event' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
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
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'event', event_name: { $in: conversionEvents } } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'conversions', value: total }];
        break;
      }

      case 'top_pages': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'pageview', url: { $ne: null } } },
          { $group: { _id: '$url', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_referrers': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'pageview', referrer: { $nin: [null, ''] } } },
          { $group: { _id: '$referrer', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_countries': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, country: { $ne: null } } },
          { $group: { _id: '$country', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_cities': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, city: { $ne: null } } },
          { $group: { _id: '$city', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_events': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'event', event_name: { $ne: null } } },
          { $group: { _id: '$event_name', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
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
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'event', event_name: { $in: conversionEvents } } },
          { $group: { _id: '$event_name', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_exit_pages': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'pageview', url: { $ne: null } } },
          { $sort: { timestamp: 1 } },
          { $group: { _id: '$session_id', url: { $last: '$url' } } },
          { $group: { _id: '$url', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_transitions': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'pageview', url: { $ne: null } } },
          {
            $setWindowFields: {
              partitionBy: '$session_id',
              sortBy: { timestamp: 1 },
              output: {
                prev_url: { $shift: { output: '$url', by: -1 } },
              },
            },
          },
          { $match: { prev_url: { $ne: null } } },
          { $group: { _id: { $concat: ['$prev_url', ' → ', '$url'] }, value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_scroll_pages': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, type: 'event', event_subtype: 'scroll_depth', page_path: { $ne: null } } },
          { $group: { _id: '$page_path', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_button_clicks': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          {
            $match: {
              ...baseMatch,
              ...filterMatch,
              type: 'event',
              event_subtype: 'button_click',
              $or: [{ element_text: { $ne: null } }, { element_selector: { $ne: null } }],
            },
          },
          { $group: { _id: { $ifNull: ['$element_text', '$element_selector'] }, value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }
      case 'top_link_targets': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          {
            $match: {
              ...baseMatch,
              ...filterMatch,
              type: 'event',
              event_subtype: { $in: ['link_click', 'outbound_click'] },
              target_url_path: { $ne: null },
            },
          },
          { $group: { _id: '$target_url_path', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_devices': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, device_type: { $ne: null } } },
          { $group: { _id: '$device_type', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_browsers': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, browser: { $ne: null } } },
          { $group: { _id: '$browser', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_os': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, os: { $ne: null } } },
          { $group: { _id: '$os', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_sources': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, utm_source: { $nin: [null, ''] } } },
          { $group: { _id: '$utm_source', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_mediums': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, utm_medium: { $nin: [null, ''] } } },
          { $group: { _id: '$utm_medium', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_utm_campaigns': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, ...filterMatch, utm_campaign: { $nin: [null, ''] } } },
          { $group: { _id: '$utm_campaign', value: { $addToSet: '$visitor_id' } } },
          { $project: { _id: 1, value: { $size: '$value' } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
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

    const baseMatch: Record<string, unknown> = {
      site_id: params.siteId,
      timestamp: { $gte: new Date(dateRange.from), $lte: new Date(dateRange.to) },
    };
    const filterMatch = buildFilterMatch(params.filters);

    if (params.metric === 'pageviews') {
      baseMatch.type = 'pageview';
    }
    if (params.metric === 'events') {
      baseMatch.type = 'event';
    }
    if (params.metric === 'conversions') {
      baseMatch.type = 'event';
      const conversionEvents = params.conversionEvents ?? [];
      if (conversionEvents.length === 0) {
        const data = fillBuckets(
          new Date(dateRange.from),
          new Date(dateRange.to),
          granularity,
          granularityToDateFormat(granularity),
          [],
        );
        return { metric: params.metric, granularity, data };
      }
      baseMatch.event_name = { $in: conversionEvents };
    }

    const dateFormat = granularityToDateFormat(granularity);

    let pipeline: object[];

    if (params.metric === 'visitors' || params.metric === 'sessions') {
      const groupField = params.metric === 'visitors' ? '$visitor_id' : '$session_id';
      pipeline = [
        { $match: { ...baseMatch, ...filterMatch } },
        {
          $group: {
            _id: {
              bucket: { $dateToString: { format: dateFormat, date: '$timestamp' } },
              entity: groupField,
            },
          },
        },
        {
          $group: {
            _id: '$_id.bucket',
            value: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ];
    } else {
      pipeline = [
        { $match: { ...baseMatch, ...filterMatch } },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$timestamp' } },
            value: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ];
    }

    const rows = await this.collection.aggregate<{ _id: string; value: number }>(pipeline).toArray();

    const data = fillBuckets(
      new Date(dateRange.from),
      new Date(dateRange.to),
      granularity,
      dateFormat,
      rows,
    );

    return { metric: params.metric, granularity, data };
  }

  // ─── Retention ──────────────────────────────────────

  async queryRetention(params: RetentionParams): Promise<RetentionResult> {
    const weeks = params.weeks ?? 8;
    const now = new Date();
    const startDate = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

    const pipeline: object[] = [
      {
        $match: {
          site_id: params.siteId,
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$visitor_id',
          firstEvent: { $min: '$timestamp' },
          eventWeeks: {
            $addToSet: {
              $dateToString: { format: '%G-W%V', date: '$timestamp' },
            },
          },
        },
      },
    ];

    const visitors = await this.collection.aggregate<{
      _id: string;
      firstEvent: Date;
      eventWeeks: string[];
    }>(pipeline).toArray();

    const cohortMap = new Map<string, { visitors: Set<string>; weekSets: Map<string, Set<string>> }>();

    for (const v of visitors) {
      const cohortWeek = getISOWeek(v.firstEvent);
      if (!cohortMap.has(cohortWeek)) {
        cohortMap.set(cohortWeek, { visitors: new Set(), weekSets: new Map() });
      }
      const cohort = cohortMap.get(cohortWeek)!;
      cohort.visitors.add(v._id);

      for (const w of v.eventWeeks) {
        if (!cohort.weekSets.has(w)) {
          cohort.weekSets.set(w, new Set());
        }
        cohort.weekSets.get(w)!.add(v._id);
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

    const match: Record<string, unknown> = { site_id: params.siteId };

    if (params.type) match.type = params.type;
    if (params.eventName) {
      match.event_name = params.eventName;
    } else if (params.eventNames && params.eventNames.length > 0) {
      match.event_name = { $in: params.eventNames };
    }
    if (params.eventSource) match.event_source = params.eventSource;
    if (params.visitorId) match.visitor_id = params.visitorId;
    if (params.userId) match.user_id = params.userId;

    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      match.timestamp = { $gte: new Date(dateRange.from), $lte: new Date(dateRange.to) };
    }

    const [events, countResult] = await Promise.all([
      this.collection
        .find(match)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(match),
    ]);

    return {
      events: events.map((e) => this.toEventListItem(e)),
      total: countResult,
      limit,
      offset,
    };
  }

  // ─── Identity Mapping ──────────────────────────────────────

  async upsertIdentity(siteId: string, visitorId: string, userId: string): Promise<void> {
    await this.identityMap.updateOne(
      { site_id: siteId, visitor_id: visitorId },
      {
        $set: { user_id: userId, identified_at: new Date() },
        $setOnInsert: { site_id: siteId, visitor_id: visitorId, created_at: new Date() },
      },
      { upsert: true },
    );
  }

  async getVisitorIdsForUser(siteId: string, userId: string): Promise<string[]> {
    const docs = await this.identityMap.find({ site_id: siteId, user_id: userId }).toArray();
    return docs.map((d) => d.visitor_id);
  }

  async getUserIdForVisitor(siteId: string, visitorId: string): Promise<string | null> {
    const doc = await this.identityMap.findOne({ site_id: siteId, visitor_id: visitorId });
    return doc?.user_id ?? null;
  }

  // ─── User Listing ──────────────────────────────────────

  async listUsers(params: UserListParams): Promise<UserListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const match: Record<string, unknown> = { site_id: params.siteId };

    const pipeline: object[] = [
      { $match: match },
      // Join with identity map to resolve visitor → user
      {
        $lookup: {
          from: IDENTITY_MAP_COLLECTION,
          let: { vid: '$visitor_id', sid: '$site_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$visitor_id', '$$vid'] }, { $eq: ['$site_id', '$$sid'] }] } } },
          ],
          as: '_identity',
        },
      },
      {
        $addFields: {
          _resolved_id: {
            $ifNull: [{ $arrayElemAt: ['$_identity.user_id', 0] }, '$visitor_id'],
          },
          _resolved_user_id: {
            $arrayElemAt: ['$_identity.user_id', 0],
          },
        },
      },
    ];

    // Search filter after $lookup so it can match identity_map userId
    if (params.search) {
      pipeline.push({
        $match: {
          $or: [
            { visitor_id: { $regex: params.search, $options: 'i' } },
            { user_id: { $regex: params.search, $options: 'i' } },
            { _resolved_user_id: { $regex: params.search, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: '$_resolved_id',
          visitorIds: { $addToSet: '$visitor_id' },
          userId: { $last: { $ifNull: ['$_resolved_user_id', '$user_id'] } },
          traits: { $last: '$traits' },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' },
          totalEvents: { $sum: 1 },
          totalPageviews: { $sum: { $cond: [{ $eq: ['$type', 'pageview'] }, 1, 0] } },
          sessions: { $addToSet: '$session_id' },
          lastUrl: { $last: '$url' },
          referrer: { $last: '$referrer' },
          device_type: { $last: '$device_type' },
          browser: { $last: '$browser' },
          os: { $last: '$os' },
          country: { $last: '$country' },
          city: { $last: '$city' },
          region: { $last: '$region' },
          language: { $last: '$language' },
          timezone: { $last: '$timezone' },
          screen_width: { $last: '$screen_width' },
          screen_height: { $last: '$screen_height' },
          utm_source: { $last: '$utm_source' },
          utm_medium: { $last: '$utm_medium' },
          utm_campaign: { $last: '$utm_campaign' },
          utm_term: { $last: '$utm_term' },
          utm_content: { $last: '$utm_content' },
        },
      },
      { $sort: { lastSeen: -1 } },
      {
        $facet: {
          data: [{ $skip: offset }, { $limit: limit }],
          count: [{ $count: 'total' }],
        },
      },
    );

    const [result] = await this.collection.aggregate<{
      data: Array<{
        _id: string;
        visitorIds: string[];
        userId: string | null;
        traits: Record<string, unknown> | null;
        firstSeen: Date;
        lastSeen: Date;
        totalEvents: number;
        totalPageviews: number;
        sessions: string[];
        lastUrl: string | null;
        referrer: string | null;
        device_type: string | null;
        browser: string | null;
        os: string | null;
        country: string | null;
        city: string | null;
        region: string | null;
        language: string | null;
        timezone: string | null;
        screen_width: number | null;
        screen_height: number | null;
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        utm_term: string | null;
        utm_content: string | null;
      }>;
      count: Array<{ total: number }>;
    }>(pipeline).toArray();

    const users: UserDetail[] = (result?.data ?? []).map((u) => ({
      visitorId: u.visitorIds[0] ?? u._id,
      visitorIds: u.visitorIds.length > 1 ? u.visitorIds : undefined,
      userId: u.userId ?? undefined,
      traits: u.traits ?? undefined,
      firstSeen: u.firstSeen.toISOString(),
      lastSeen: u.lastSeen.toISOString(),
      totalEvents: u.totalEvents,
      totalPageviews: u.totalPageviews,
      totalSessions: u.sessions.length,
      lastUrl: u.lastUrl ?? undefined,
      referrer: u.referrer ?? undefined,
      device: u.device_type ? { type: u.device_type, browser: u.browser ?? '', os: u.os ?? '' } : undefined,
      geo: u.country ? { country: u.country, city: u.city ?? undefined, region: u.region ?? undefined } : undefined,
      language: u.language ?? undefined,
      timezone: u.timezone ?? undefined,
      screen: (u.screen_width || u.screen_height) ? { width: u.screen_width ?? 0, height: u.screen_height ?? 0 } : undefined,
      utm: u.utm_source ? {
        source: u.utm_source ?? undefined,
        medium: u.utm_medium ?? undefined,
        campaign: u.utm_campaign ?? undefined,
        term: u.utm_term ?? undefined,
        content: u.utm_content ?? undefined,
      } : undefined,
    }));

    return {
      users,
      total: result?.count?.[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  async getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null> {
    // Try as userId first — find all linked visitorIds
    const visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length > 0) {
      return this.getMergedUserDetail(siteId, identifier, visitorIds);
    }
    // Try as visitorId — resolve to userId
    const userId = await this.getUserIdForVisitor(siteId, identifier);
    if (userId) {
      const allVisitorIds = await this.getVisitorIdsForUser(siteId, userId);
      return this.getMergedUserDetail(siteId, userId, allVisitorIds);
    }
    // Pure anonymous — single visitorId
    return this.getMergedUserDetail(siteId, undefined, [identifier]);
  }

  async getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult> {
    // Resolve all visitorIds for this identifier
    let visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length === 0) {
      const userId = await this.getUserIdForVisitor(siteId, identifier);
      if (userId) {
        visitorIds = await this.getVisitorIdsForUser(siteId, userId);
      }
    }
    if (visitorIds.length === 0) {
      visitorIds = [identifier];
    }
    return this.listEventsForVisitorIds(siteId, visitorIds, params);
  }

  private async getMergedUserDetail(siteId: string, userId: string | undefined, visitorIds: string[]): Promise<UserDetail | null> {
    const pipeline: object[] = [
      { $match: { site_id: siteId, visitor_id: { $in: visitorIds } } },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: null,
          visitorIds: { $addToSet: '$visitor_id' },
          traits: { $last: '$traits' },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' },
          totalEvents: { $sum: 1 },
          totalPageviews: { $sum: { $cond: [{ $eq: ['$type', 'pageview'] }, 1, 0] } },
          sessions: { $addToSet: '$session_id' },
          lastUrl: { $last: '$url' },
          referrer: { $last: '$referrer' },
          device_type: { $last: '$device_type' },
          browser: { $last: '$browser' },
          os: { $last: '$os' },
          country: { $last: '$country' },
          city: { $last: '$city' },
          region: { $last: '$region' },
          language: { $last: '$language' },
          timezone: { $last: '$timezone' },
          screen_width: { $last: '$screen_width' },
          screen_height: { $last: '$screen_height' },
          utm_source: { $last: '$utm_source' },
          utm_medium: { $last: '$utm_medium' },
          utm_campaign: { $last: '$utm_campaign' },
          utm_term: { $last: '$utm_term' },
          utm_content: { $last: '$utm_content' },
        },
      },
    ];

    const [row] = await this.collection.aggregate<{
      visitorIds: string[];
      traits: Record<string, unknown> | null;
      firstSeen: Date;
      lastSeen: Date;
      totalEvents: number;
      totalPageviews: number;
      sessions: string[];
      lastUrl: string | null;
      referrer: string | null;
      device_type: string | null;
      browser: string | null;
      os: string | null;
      country: string | null;
      city: string | null;
      region: string | null;
      language: string | null;
      timezone: string | null;
      screen_width: number | null;
      screen_height: number | null;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      utm_term: string | null;
      utm_content: string | null;
    }>(pipeline).toArray();

    if (!row) return null;

    return {
      visitorId: visitorIds[0],
      visitorIds: row.visitorIds.length > 1 ? row.visitorIds : undefined,
      userId: userId ?? undefined,
      traits: row.traits ?? undefined,
      firstSeen: row.firstSeen.toISOString(),
      lastSeen: row.lastSeen.toISOString(),
      totalEvents: row.totalEvents,
      totalPageviews: row.totalPageviews,
      totalSessions: row.sessions.length,
      lastUrl: row.lastUrl ?? undefined,
      referrer: row.referrer ?? undefined,
      device: row.device_type ? { type: row.device_type, browser: row.browser ?? '', os: row.os ?? '' } : undefined,
      geo: row.country ? { country: row.country, city: row.city ?? undefined, region: row.region ?? undefined } : undefined,
      language: row.language ?? undefined,
      timezone: row.timezone ?? undefined,
      screen: (row.screen_width || row.screen_height) ? { width: row.screen_width ?? 0, height: row.screen_height ?? 0 } : undefined,
      utm: row.utm_source ? {
        source: row.utm_source ?? undefined,
        medium: row.utm_medium ?? undefined,
        campaign: row.utm_campaign ?? undefined,
        term: row.utm_term ?? undefined,
        content: row.utm_content ?? undefined,
      } : undefined,
    };
  }

  private async listEventsForVisitorIds(siteId: string, visitorIds: string[], params: EventListParams): Promise<EventListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const match: Record<string, unknown> = {
      site_id: siteId,
      visitor_id: { $in: visitorIds },
    };

    if (params.type) match.type = params.type;
    if (params.eventName) {
      match.event_name = params.eventName;
    } else if (params.eventNames && params.eventNames.length > 0) {
      match.event_name = { $in: params.eventNames };
    }
    if (params.eventSource) match.event_source = params.eventSource;

    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      match.timestamp = { $gte: new Date(dateRange.from), $lte: new Date(dateRange.to) };
    }

    const [events, countResult] = await Promise.all([
      this.collection
        .find(match)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(match),
    ]);

    return {
      events: events.map((e) => this.toEventListItem(e)),
      total: countResult,
      limit,
      offset,
    };
  }

  private toEventListItem(doc: EventDocument): EventListItem {
    return {
      id: (doc as any)._id?.toString?.() ?? '',
      type: doc.type as EventListItem['type'],
      timestamp: doc.timestamp.toISOString(),
      visitorId: doc.visitor_id,
      sessionId: doc.session_id,
      url: doc.url ?? undefined,
      referrer: doc.referrer ?? undefined,
      title: doc.title ?? undefined,
      name: doc.event_name ?? undefined,
      properties: doc.properties ?? undefined,
      eventSource: doc.event_source ? (doc.event_source as EventListItem['eventSource']) : undefined,
      eventSubtype: doc.event_subtype ? (doc.event_subtype as EventListItem['eventSubtype']) : undefined,
      pagePath: doc.page_path ?? undefined,
      targetUrlPath: doc.target_url_path ?? undefined,
      elementSelector: doc.element_selector ?? undefined,
      elementText: doc.element_text ?? undefined,
      scrollDepthPct: doc.scroll_depth_pct ?? undefined,
      userId: doc.user_id ?? undefined,
      traits: doc.traits ?? undefined,
      geo: doc.country ? { country: doc.country, city: doc.city ?? undefined, region: doc.region ?? undefined } : undefined,
      device: doc.device_type ? { type: doc.device_type, browser: doc.browser ?? '', os: doc.os ?? '' } : undefined,
      language: doc.language ?? undefined,
      utm: doc.utm_source ? {
        source: doc.utm_source ?? undefined,
        medium: doc.utm_medium ?? undefined,
        campaign: doc.utm_campaign ?? undefined,
        term: doc.utm_term ?? undefined,
        content: doc.utm_content ?? undefined,
      } : undefined,
    };
  }

  // ─── Site Management ──────────────────────────────────────

  async createSite(data: CreateSiteRequest): Promise<Site> {
    const now = new Date();
    const doc: SiteDocument = {
      site_id: generateSiteId(),
      secret_key: generateSecretKey(),
      name: data.name,
      domain: data.domain ?? null,
      allowed_origins: data.allowedOrigins ?? null,
      conversion_events: data.conversionEvents ?? null,
      created_at: now,
      updated_at: now,
    };
    await this.sites.insertOne(doc);
    return this.toSite(doc);
  }

  async getSite(siteId: string): Promise<Site | null> {
    const doc = await this.sites.findOne({ site_id: siteId });
    return doc ? this.toSite(doc) : null;
  }

  async getSiteBySecret(secretKey: string): Promise<Site | null> {
    const doc = await this.sites.findOne({ secret_key: secretKey });
    return doc ? this.toSite(doc) : null;
  }

  async listSites(): Promise<Site[]> {
    const docs = await this.sites.find({}).sort({ created_at: -1 }).toArray();
    return docs.map((d) => this.toSite(d));
  }

  async updateSite(siteId: string, data: UpdateSiteRequest): Promise<Site | null> {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.domain !== undefined) updates.domain = data.domain || null;
    if (data.allowedOrigins !== undefined) updates.allowed_origins = data.allowedOrigins.length > 0 ? data.allowedOrigins : null;
    if (data.conversionEvents !== undefined) updates.conversion_events = data.conversionEvents.length > 0 ? data.conversionEvents : null;

    const result = await this.sites.findOneAndUpdate(
      { site_id: siteId },
      { $set: updates },
      { returnDocument: 'after' },
    );
    return result ? this.toSite(result) : null;
  }

  async deleteSite(siteId: string): Promise<boolean> {
    const result = await this.sites.deleteOne({ site_id: siteId });
    return result.deletedCount > 0;
  }

  async regenerateSecret(siteId: string): Promise<Site | null> {
    const result = await this.sites.findOneAndUpdate(
      { site_id: siteId },
      { $set: { secret_key: generateSecretKey(), updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return result ? this.toSite(result) : null;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  // ─── Helpers ─────────────────────────────────────────────

  private toSite(doc: SiteDocument): Site {
    return {
      siteId: doc.site_id,
      secretKey: doc.secret_key,
      name: doc.name,
      domain: doc.domain ?? undefined,
      allowedOrigins: doc.allowed_origins ?? undefined,
      conversionEvents: doc.conversion_events ?? undefined,
      createdAt: doc.created_at.toISOString(),
      updatedAt: doc.updated_at.toISOString(),
    };
  }
}
