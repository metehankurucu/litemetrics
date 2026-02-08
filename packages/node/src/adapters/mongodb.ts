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

const EVENTS_COLLECTION = 'litemetrics_events';
const SITES_COLLECTION = 'litemetrics_sites';

export class MongoDBAdapter implements DBAdapter {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<EventDocument>;
  private sites!: Collection<SiteDocument>;

  constructor(url: string) {
    this.client = new MongoClient(url);
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db();
    this.collection = this.db.collection<EventDocument>(EVENTS_COLLECTION);
    this.sites = this.db.collection<SiteDocument>(SITES_COLLECTION);

    await Promise.all([
      this.collection.createIndex({ site_id: 1, timestamp: -1 }),
      this.collection.createIndex({ site_id: 1, type: 1 }),
      this.collection.createIndex({ site_id: 1, visitor_id: 1 }),
      this.collection.createIndex({ site_id: 1, session_id: 1 }),
      this.sites.createIndex({ site_id: 1 }, { unique: true }),
      this.sites.createIndex({ secret_key: 1 }),
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

    let data: QueryDataPoint[] = [];
    let total = 0;

    switch (q.metric) {
      case 'pageviews': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, type: 'pageview' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'pageviews', value: total }];
        break;
      }

      case 'visitors': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: baseMatch },
          { $group: { _id: '$visitor_id' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'visitors', value: total }];
        break;
      }

      case 'sessions': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: baseMatch },
          { $group: { _id: '$session_id' } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'sessions', value: total }];
        break;
      }

      case 'events': {
        const [result] = await this.collection.aggregate<{ count: number }>([
          { $match: { ...baseMatch, type: 'event' } },
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
          { $match: { ...baseMatch, type: 'event', event_name: { $in: conversionEvents } } },
          { $count: 'count' },
        ]).toArray();
        total = result?.count ?? 0;
        data = [{ key: 'conversions', value: total }];
        break;
      }

      case 'top_pages': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, type: 'pageview', url: { $ne: null } } },
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
          { $match: { ...baseMatch, type: 'pageview', referrer: { $nin: [null, ''] } } },
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
          { $match: { ...baseMatch, country: { $ne: null } } },
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
          { $match: { ...baseMatch, city: { $ne: null } } },
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
          { $match: { ...baseMatch, type: 'event', event_name: { $ne: null } } },
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
          { $match: { ...baseMatch, type: 'event', event_name: { $in: conversionEvents } } },
          { $group: { _id: '$event_name', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        ]).toArray();
        data = rows.map((r) => ({ key: r._id, value: r.value }));
        total = data.reduce((sum, d) => sum + d.value, 0);
        break;
      }

      case 'top_devices': {
        const rows = await this.collection.aggregate<{ _id: string; value: number }>([
          { $match: { ...baseMatch, device_type: { $ne: null } } },
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
          { $match: { ...baseMatch, browser: { $ne: null } } },
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
          { $match: { ...baseMatch, os: { $ne: null } } },
          { $group: { _id: '$os', value: { $addToSet: '$visitor_id' } } },
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

    if (params.metric === 'pageviews') {
      baseMatch.type = 'pageview';
    }

    const dateFormat = granularityToDateFormat(granularity);

    let pipeline: object[];

    if (params.metric === 'visitors' || params.metric === 'sessions') {
      const groupField = params.metric === 'visitors' ? '$visitor_id' : '$session_id';
      pipeline = [
        { $match: baseMatch },
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
        { $match: baseMatch },
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

  // ─── User Listing ──────────────────────────────────────

  async listUsers(params: UserListParams): Promise<UserListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const match: Record<string, unknown> = { site_id: params.siteId };

    if (params.search) {
      match.$or = [
        { visitor_id: { $regex: params.search, $options: 'i' } },
        { user_id: { $regex: params.search, $options: 'i' } },
      ];
    }

    const pipeline: object[] = [
      { $match: match },
      {
        $group: {
          _id: '$visitor_id',
          userId: { $last: '$user_id' },
          traits: { $last: '$traits' },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' },
          totalEvents: { $sum: 1 },
          totalPageviews: { $sum: { $cond: [{ $eq: ['$type', 'pageview'] }, 1, 0] } },
          sessions: { $addToSet: '$session_id' },
          lastUrl: { $last: '$url' },
          device_type: { $last: '$device_type' },
          browser: { $last: '$browser' },
          os: { $last: '$os' },
          country: { $last: '$country' },
          city: { $last: '$city' },
          region: { $last: '$region' },
          language: { $last: '$language' },
        },
      },
      { $sort: { lastSeen: -1 } },
      {
        $facet: {
          data: [{ $skip: offset }, { $limit: limit }],
          count: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await this.collection.aggregate<{
      data: Array<{
        _id: string;
        userId: string | null;
        traits: Record<string, unknown> | null;
        firstSeen: Date;
        lastSeen: Date;
        totalEvents: number;
        totalPageviews: number;
        sessions: string[];
        lastUrl: string | null;
        device_type: string | null;
        browser: string | null;
        os: string | null;
        country: string | null;
        city: string | null;
        region: string | null;
        language: string | null;
      }>;
      count: Array<{ total: number }>;
    }>(pipeline).toArray();

    const users: UserDetail[] = (result?.data ?? []).map((u) => ({
      visitorId: u._id,
      userId: u.userId ?? undefined,
      traits: u.traits ?? undefined,
      firstSeen: u.firstSeen.toISOString(),
      lastSeen: u.lastSeen.toISOString(),
      totalEvents: u.totalEvents,
      totalPageviews: u.totalPageviews,
      totalSessions: u.sessions.length,
      lastUrl: u.lastUrl ?? undefined,
      device: u.device_type ? { type: u.device_type, browser: u.browser ?? '', os: u.os ?? '' } : undefined,
      geo: u.country ? { country: u.country, city: u.city ?? undefined, region: u.region ?? undefined } : undefined,
      language: u.language ?? undefined,
    }));

    return {
      users,
      total: result?.count?.[0]?.total ?? 0,
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
