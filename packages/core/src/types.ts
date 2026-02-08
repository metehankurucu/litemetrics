// ─── Event Types ────────────────────────────────────────────

export type EventType = 'pageview' | 'event' | 'identify';
export type EventSource = 'auto' | 'manual';
export type EventSubtype =
  | 'custom'
  | 'attribute'
  | 'link_click'
  | 'outbound_click'
  | 'file_download'
  | 'scroll_depth'
  | 'button_click'
  | 'rage_click';

export interface BaseEvent {
  type: EventType;
  siteId: string;
  timestamp: number;
  sessionId: string;
  visitorId: string;
}

export interface PageviewEvent extends BaseEvent {
  type: 'pageview';
  url: string;
  referrer?: string;
  title?: string;
}

export interface CustomEvent extends BaseEvent {
  type: 'event';
  name: string;
  properties?: Record<string, unknown>;
  eventSource?: EventSource;
  eventSubtype?: EventSubtype;
  pagePath?: string;
  targetUrlPath?: string;
  elementSelector?: string;
  elementText?: string;
  scrollDepthPct?: number;
}

export interface IdentifyEvent extends BaseEvent {
  type: 'identify';
  userId: string;
  traits?: Record<string, unknown>;
}

export type LitemetricsEvent = PageviewEvent | CustomEvent | IdentifyEvent;

// ─── Event Payload (what client sends) ─────────────────────

export interface ConnectionInfo {
  type?: string;
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
}

export interface ClientContext {
  screen?: { width: number; height: number };
  language?: string;
  timezone?: string;
  connection?: ConnectionInfo;
  utm?: UTMParams;
}

export interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export type ClientEvent = LitemetricsEvent & ClientContext;

// ─── Enriched Event (after server processing) ──────────────

export interface GeoInfo {
  country?: string;
  city?: string;
  region?: string;
}

export interface DeviceInfo {
  type: string;    // desktop, mobile, tablet
  browser: string;
  os: string;
}

export interface EnrichedEvent extends ClientContext {
  type: EventType;
  siteId: string;
  timestamp: number;
  sessionId: string;
  visitorId: string;

  // Pageview
  url?: string;
  referrer?: string;
  title?: string;

  // Custom event
  name?: string;
  properties?: Record<string, unknown>;
  eventSource?: EventSource;
  eventSubtype?: EventSubtype;
  pagePath?: string;
  targetUrlPath?: string;
  elementSelector?: string;
  elementText?: string;
  scrollDepthPct?: number;

  // Identify
  userId?: string;
  traits?: Record<string, unknown>;

  // Server-enriched
  ip?: string;
  geo?: GeoInfo;
  device?: DeviceInfo;
}

// ─── Collect Payload ────────────────────────────────────────

export interface CollectPayload {
  events: ClientEvent[];
}

export interface CollectResponse {
  ok: boolean;
  error?: string;
}

// ─── Tracker Config (client-side) ───────────────────────────

export interface TrackerConfig {
  siteId: string;
  endpoint: string;
  autoTrack?: boolean;
  autoSpa?: boolean;
  autoOutbound?: boolean;
  autoFileDownloads?: boolean;
  autoScrollDepth?: boolean;
  autoRageClicks?: boolean;
  autoLinkClicks?: boolean;
  autoButtonClicks?: boolean;
  batchSize?: number;
  flushInterval?: number;
  respectDnt?: boolean;
  debug?: boolean;
}

// ─── Collector Config (server-side) ─────────────────────────

export interface CollectorConfig {
  db: DBConfig;
  adminSecret?: string;
  geoip?: boolean | GeoIPConfig;
  cors?: CORSConfig;
  trustProxy?: boolean;
}

export interface DBConfig {
  adapter?: 'clickhouse' | 'mongodb';
  url: string;
}

export interface GeoIPConfig {
  dbPath?: string;
}

export interface CORSConfig {
  origins?: string[];
}

// ─── Site Management ────────────────────────────────────────

export interface Site {
  siteId: string;
  secretKey: string;
  name: string;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteRequest {
  name: string;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
}

export interface UpdateSiteRequest {
  name?: string;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
}

// ─── DB Adapter Interface ───────────────────────────────────

export interface DBAdapter {
  init(): Promise<void>;
  insertEvents(events: EnrichedEvent[]): Promise<void>;
  query(q: QueryParams): Promise<QueryResult>;
  queryTimeSeries(params: TimeSeriesParams): Promise<TimeSeriesResult>;
  queryRetention(params: RetentionParams): Promise<RetentionResult>;
  close(): Promise<void>;

  // Event & user listing
  listEvents(params: EventListParams): Promise<EventListResult>;
  listUsers(params: UserListParams): Promise<UserListResult>;
  getUserDetail(siteId: string, visitorId: string): Promise<UserDetail | null>;
  getUserEvents(siteId: string, visitorId: string, params: EventListParams): Promise<EventListResult>;

  // Site management
  createSite(data: CreateSiteRequest): Promise<Site>;
  getSite(siteId: string): Promise<Site | null>;
  getSiteBySecret(secretKey: string): Promise<Site | null>;
  listSites(): Promise<Site[]>;
  updateSite(siteId: string, data: UpdateSiteRequest): Promise<Site | null>;
  deleteSite(siteId: string): Promise<boolean>;
  regenerateSecret(siteId: string): Promise<Site | null>;
}

// ─── Query API ──────────────────────────────────────────────

export type Metric =
  | 'pageviews'
  | 'visitors'
  | 'sessions'
  | 'events'
  | 'conversions'
  | 'top_pages'
  | 'top_referrers'
  | 'top_countries'
  | 'top_cities'
  | 'top_events'
  | 'top_conversions'
  | 'top_exit_pages'
  | 'top_transitions'
  | 'top_scroll_pages'
  | 'top_button_clicks'
  | 'top_link_targets'
  | 'top_devices'
  | 'top_browsers'
  | 'top_os';

export type Period = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';

export interface QueryParams {
  siteId: string;
  metric: Metric;
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  filters?: Record<string, string>;
  limit?: number;
  compare?: boolean;
  conversionEvents?: string[];
}

export interface QueryResult {
  metric: Metric;
  period: Period;
  data: QueryDataPoint[];
  total: number;
  previousTotal?: number;
  changePercent?: number;
}

export interface QueryDataPoint {
  key: string;
  value: number;
  change?: number;
}

// ─── Time Series ────────────────────────────────────────────

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export interface TimeSeriesParams {
  siteId: string;
  metric: 'pageviews' | 'visitors' | 'sessions' | 'events' | 'conversions';
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  granularity?: Granularity;
  filters?: Record<string, string>;
  conversionEvents?: string[];
}

export interface TimeSeriesResult {
  metric: string;
  granularity: Granularity;
  data: TimeSeriesPoint[];
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

// ─── Event Listing ──────────────────────────────────────────

export interface EventListParams {
  siteId: string;
  type?: EventType;
  eventName?: string;
  eventNames?: string[];
  eventSource?: EventSource;
  visitorId?: string;
  userId?: string;
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface EventListItem {
  id: string;
  type: EventType;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  url?: string;
  referrer?: string;
  title?: string;
  name?: string;
  properties?: Record<string, unknown>;
  eventSource?: EventSource;
  eventSubtype?: EventSubtype;
  pagePath?: string;
  targetUrlPath?: string;
  elementSelector?: string;
  elementText?: string;
  scrollDepthPct?: number;
  userId?: string;
  traits?: Record<string, unknown>;
  geo?: GeoInfo;
  device?: DeviceInfo;
  language?: string;
  utm?: UTMParams;
}

export interface EventListResult {
  events: EventListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ─── User Listing ───────────────────────────────────────────

export interface UserListParams {
  siteId: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UserDetail {
  visitorId: string;
  userId?: string;
  traits?: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  totalPageviews: number;
  totalSessions: number;
  lastUrl?: string;
  referrer?: string;
  device?: DeviceInfo;
  geo?: GeoInfo;
  language?: string;
  timezone?: string;
  screen?: { width: number; height: number };
  utm?: UTMParams;
}

export interface UserListResult {
  users: UserDetail[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Retention ─────────────────────────────────────────────

export interface RetentionParams {
  siteId: string;
  period?: Period;
  weeks?: number;
}

export interface RetentionCohort {
  week: string;
  size: number;
  retention: number[];
}

export interface RetentionResult {
  cohorts: RetentionCohort[];
}
