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
  userId?: string;
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
  userId: string;  // required for identify (overrides optional in BaseEvent)
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

export interface MobileContext {
  platform?: 'ios' | 'android';
  osVersion?: string;
  deviceModel?: string;
  deviceBrand?: string;
  appVersion?: string;
  appBuild?: string;
  sdkName?: string;
  sdkVersion?: string;
  isEmulator?: boolean;
}

export interface ClientContext {
  screen?: { width: number; height: number };
  language?: string;
  timezone?: string;
  connection?: ConnectionInfo;
  utm?: UTMParams;
  mobile?: MobileContext;
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
  osVersion?: string;
  deviceModel?: string;
  deviceBrand?: string;
  appVersion?: string;
  appBuild?: string;
  sdkName?: string;
  sdkVersion?: string;
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
  botFlag?: 'signature' | 'heuristic' | 'rate-limit';
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

export type BotFilterMode = 'off' | 'standard' | 'strict' | 'shadow';

export interface BotFilterConfig {
  /** Default mode for sites that don't override. Default: 'standard'. */
  defaultMode?: BotFilterMode;
  /** Sliding-window size in ms for rate-limit layer. Default: 60_000. */
  rateLimitWindowMs?: number;
  /** Max events per window per IP before rate-limit fires. Default: 60. */
  rateLimitMaxEvents?: number;
  /** Optional callback fired whenever an event is flagged or dropped (analytics/audit). */
  onBotDetected?: (info: BotDetectedInfo) => void;
  /**
   * Fired once per site when app-SDK events arrive at a site that is not typed as
   * `app`. Unless its bot-filter mode is `off`, such a site is filtered as browser
   * traffic, which silently drops its Android events; either way the dashboard shows
   * it as a web site. Reporting only - the request is filtered exactly as before.
   */
  onSiteTypeMismatch?: (info: SiteTypeMismatchInfo) => void;
}

export interface SiteTypeMismatchInfo {
  siteId: string;
  /** The site's configured type, or undefined when it was never set. */
  siteType: SiteType | undefined;
  /** The platform the SDK declared in the event payload. */
  platform: string;
  /** The bot-filter mode the request was processed under. `off` means nothing was filtered. */
  mode: BotFilterMode;
}

/**
 * Why a request tripped the bot filter. Finer-grained than `layer`: the signature
 * layer fires both for a missing User-Agent and for an isbot list match, and telling
 * those two apart is what makes a drop diagnosable from a log line alone.
 */
export type BotDropReason =
  /** No User-Agent header at all (or an empty one). */
  | 'empty-ua'
  /** The User-Agent matched the maintained isbot signature list. */
  | 'ua-signature'
  /** Heuristic layer: browser, engine, Accept-Language and Referer were all absent. */
  | 'no-browser-signals'
  /** The per-IP sliding window overflowed. */
  | 'rate-limit';

export interface BotDetectedInfo {
  siteId: string;
  ip: string;
  userAgent: string;
  layer: 'signature' | 'heuristic' | 'rate-limit';
  reason: BotDropReason;
  action: 'dropped' | 'flagged';
  mode: BotFilterMode;
}

export interface CollectorConfig {
  db: DBConfig;
  adminSecret?: string;
  geoip?: boolean | GeoIPConfig;
  cors?: CORSConfig;
  trustProxy?: boolean;
  timestampSanity?: TimestampSanityConfig;
  botFilter?: BotFilterConfig;
}

export type TimestampOutOfWindowReason = 'future' | 'past' | 'invalid';

export interface TimestampOutOfWindowInfo {
  reason: TimestampOutOfWindowReason;
  offsetMs: number;
  event: ClientEvent;
}

export interface TimestampSanityConfig {
  futureMs?: number;
  pastMs?: number;
  mode?: 'drop' | 'clamp' | 'off';
  onOutOfWindow?: (info: TimestampOutOfWindowInfo) => void;
}

export interface DBConfig {
  adapter?: 'clickhouse' | 'mongodb' | 'postgres';
  url: string;
}

export interface GeoIPConfig {
  dbPath?: string;
}

export interface CORSConfig {
  origins?: string[];
}

// ─── Site Management ────────────────────────────────────────

export type SiteType = 'web' | 'app';

export interface Site {
  siteId: string;
  secretKey: string;
  name: string;
  type?: SiteType;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
  botFilterMode?: BotFilterMode;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteRequest {
  name: string;
  type?: SiteType;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
}

export interface UpdateSiteRequest {
  name?: string;
  type?: SiteType;
  domain?: string;
  allowedOrigins?: string[];
  conversionEvents?: string[];
  botFilterMode?: BotFilterMode | null;
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
  getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null>;
  getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult>;

  /**
   * Delete every event for a user on a site. Resolves both `userId` (logged-in
   * identifier) and `visitorId` (anonymous cookie ID) - passes either.
   * Returns the number of events deleted. Idempotent: returns 0 if nothing matched.
   */
  deleteUserEvents(siteId: string, identifier: string): Promise<{ deleted: number }>;

  /**
   * Count events flagged by the bot filter for a site within a time range.
   * Used by the dashboard to show how many bot events were filtered.
   */
  queryBotStats(
    siteId: string,
    range: { from: number; to: number },
  ): Promise<{
    total: number;
    bySignature: number;
    byHeuristic: number;
    byRateLimit: number;
  }>;

  // Identity mapping
  upsertIdentity(siteId: string, visitorId: string, userId: string): Promise<void>;
  getVisitorIdsForUser(siteId: string, userId: string): Promise<string[]>;
  getUserIdForVisitor(siteId: string, visitorId: string): Promise<string | null>;

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
  | 'top_os'
  | 'top_os_versions'
  | 'top_device_models'
  | 'top_app_versions'
  | 'top_utm_sources'
  | 'top_utm_mediums'
  | 'top_utm_campaigns'
  | 'top_utm_terms'
  | 'top_utm_contents'
  | 'top_channels';

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
  timezone?: string;
  /**
   * Include events flagged by the bot filter. Defaults to false (bots excluded).
   * When false, rows where `bot_flag` is non-null are excluded from analytics queries.
   */
  includeBots?: boolean;
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
  timezone?: string;
  /** Include events flagged by the bot filter. Defaults to false. */
  includeBots?: boolean;
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
  /** Include events flagged by the bot filter. Defaults to false. */
  includeBots?: boolean;
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
  /** Include events flagged by the bot filter when aggregating user data. Defaults to false. */
  includeBots?: boolean;
}

export interface UserDetail {
  visitorId: string;
  visitorIds?: string[];
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
  /** Include events flagged by the bot filter. Defaults to false. */
  includeBots?: boolean;
}

export interface RetentionCohort {
  week: string;
  size: number;
  retention: number[];
}

export interface RetentionResult {
  cohorts: RetentionCohort[];
}
