import axios, { type AxiosInstance } from 'axios';
import type { Metric, Period, Granularity, QueryResult, TimeSeriesResult, RetentionResult, EventListResult, UserListResult, UserDetail, EventType } from '@litemetrics/core';

export interface LitemetricsClientConfig {
  /** Base URL of the Litemetrics server (e.g. "https://analytics.myapp.com") */
  baseUrl: string;
  /** Site ID to query */
  siteId: string;
  /** Secret key for authentication (sk_xxx) */
  secretKey?: string;
  /** Query endpoint path (default: "/api/stats") */
  endpoint?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}

export interface StatsOptions {
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  filters?: Record<string, string>;
  compare?: boolean;
}

export interface RetentionOptions {
  period?: Period;
  weeks?: number;
}

export interface EventsListOptions {
  type?: EventType;
  eventName?: string;
  eventNames?: string[];
  visitorId?: string;
  userId?: string;
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface TimeSeriesOptions {
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  granularity?: Granularity;
}

export interface UsersListOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export class LitemetricsClient {
  private siteId: string;
  private endpoint: string;
  private http: AxiosInstance;

  constructor(config: LitemetricsClientConfig) {
    this.siteId = config.siteId;
    this.endpoint = config.endpoint ?? '/api/stats';

    const headers: Record<string, string> = { ...config.headers };
    if (config.secretKey) {
      headers['X-Litemetrics-Secret'] = config.secretKey;
    }

    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      headers,
    });
  }

  /** Change the active site ID */
  setSiteId(siteId: string): void {
    this.siteId = siteId;
  }

  /** Get any metric */
  async getStats(metric: Metric, options?: StatsOptions): Promise<QueryResult> {
    const params: Record<string, string> = {
      siteId: this.siteId,
      metric,
    };

    if (options?.period) params.period = options.period;
    if (options?.dateFrom) params.dateFrom = options.dateFrom;
    if (options?.dateTo) params.dateTo = options.dateTo;
    if (options?.limit) params.limit = String(options.limit);
    if (options?.filters) params.filters = JSON.stringify(options.filters);
    if (options?.compare) params.compare = 'true';

    const { data } = await this.http.get<QueryResult>(this.endpoint, { params });
    return data;
  }

  // ─── Convenience methods ──────────────────────────────────

  async getPageviews(options?: StatsOptions) { return this.getStats('pageviews', options); }
  async getVisitors(options?: StatsOptions) { return this.getStats('visitors', options); }
  async getSessions(options?: StatsOptions) { return this.getStats('sessions', options); }
  async getEvents(options?: StatsOptions) { return this.getStats('events', options); }
  async getTopPages(options?: StatsOptions) { return this.getStats('top_pages', options); }
  async getTopReferrers(options?: StatsOptions) { return this.getStats('top_referrers', options); }
  async getTopCountries(options?: StatsOptions) { return this.getStats('top_countries', options); }
  async getTopCities(options?: StatsOptions) { return this.getStats('top_cities', options); }
  async getTopEvents(options?: StatsOptions) { return this.getStats('top_events', options); }
  async getTopDevices(options?: StatsOptions) { return this.getStats('top_devices', options); }
  async getTopBrowsers(options?: StatsOptions) { return this.getStats('top_browsers', options); }
  async getTopOS(options?: StatsOptions) { return this.getStats('top_os', options); }

  /** Fetch multiple metrics in parallel */
  async getOverview(
    metrics: Metric[] = ['pageviews', 'visitors', 'sessions', 'events', 'conversions'],
    options?: StatsOptions,
  ): Promise<Record<Metric, QueryResult>> {
    const results = await Promise.all(
      metrics.map((m) => this.getStats(m, options).then((r) => [m, r] as const)),
    );
    return Object.fromEntries(results) as Record<Metric, QueryResult>;
  }

  // ─── Time series ──────────────────────────────────────

  async getTimeSeries(
    metric: 'pageviews' | 'visitors' | 'sessions',
    options?: TimeSeriesOptions,
  ): Promise<TimeSeriesResult> {
    const params: Record<string, string> = {
      siteId: this.siteId,
      metric: 'timeseries',
      tsMetric: metric,
    };

    if (options?.period) params.period = options.period;
    if (options?.dateFrom) params.dateFrom = options.dateFrom;
    if (options?.dateTo) params.dateTo = options.dateTo;
    if (options?.granularity) params.granularity = options.granularity;

    const { data } = await this.http.get<TimeSeriesResult>(this.endpoint, { params });
    return data;
  }

  // ─── Event listing ──────────────────────────────────────

  async getEventsList(options?: EventsListOptions): Promise<EventListResult> {
    const params: Record<string, string> = { siteId: this.siteId };

    if (options?.type) params.type = options.type;
    if (options?.eventName) params.eventName = options.eventName;
    if (options?.eventNames && options.eventNames.length > 0) params.eventNames = options.eventNames.join(',');
    if (options?.visitorId) params.visitorId = options.visitorId;
    if (options?.userId) params.userId = options.userId;
    if (options?.period) params.period = options.period;
    if (options?.dateFrom) params.dateFrom = options.dateFrom;
    if (options?.dateTo) params.dateTo = options.dateTo;
    if (options?.limit) params.limit = String(options.limit);
    if (options?.offset) params.offset = String(options.offset);

    const { data } = await this.http.get<EventListResult>('/api/events', { params });
    return data;
  }

  // ─── User listing ──────────────────────────────────────

  async getUsers(options?: UsersListOptions): Promise<UserListResult> {
    const params: Record<string, string> = { siteId: this.siteId };

    if (options?.search) params.search = options.search;
    if (options?.limit) params.limit = String(options.limit);
    if (options?.offset) params.offset = String(options.offset);

    const { data } = await this.http.get<UserListResult>('/api/users', { params });
    return data;
  }

  async getUserDetail(visitorId: string): Promise<UserDetail> {
    const params: Record<string, string> = { siteId: this.siteId };
    const { data } = await this.http.get<{ user: UserDetail }>(`/api/users/${encodeURIComponent(visitorId)}`, { params });
    return data.user;
  }

  async getUserEvents(visitorId: string, options?: EventsListOptions): Promise<EventListResult> {
    const params: Record<string, string> = { siteId: this.siteId };

    if (options?.type) params.type = options.type;
    if (options?.eventName) params.eventName = options.eventName;
    if (options?.eventNames && options.eventNames.length > 0) params.eventNames = options.eventNames.join(',');
    if (options?.period) params.period = options.period;
    if (options?.dateFrom) params.dateFrom = options.dateFrom;
    if (options?.dateTo) params.dateTo = options.dateTo;
    if (options?.limit) params.limit = String(options.limit);
    if (options?.offset) params.offset = String(options.offset);

    const { data } = await this.http.get<EventListResult>(`/api/users/${encodeURIComponent(visitorId)}/events`, { params });
    return data;
  }

  // ─── Retention ──────────────────────────────────────

  async getRetention(options?: RetentionOptions): Promise<RetentionResult> {
    const params: Record<string, string> = {
      siteId: this.siteId,
      metric: 'retention',
    };

    if (options?.period) params.period = options.period;
    if (options?.weeks) params.weeks = String(options.weeks);

    const { data } = await this.http.get<RetentionResult>(this.endpoint, { params });
    return data;
  }
}

/** Create an LitemetricsClient instance */
export function createClient(config: LitemetricsClientConfig): LitemetricsClient {
  return new LitemetricsClient(config);
}
