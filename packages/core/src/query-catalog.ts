import type { Metric } from './types';

// ─── Query catalog ──────────────────────────────────────────
//
// Single source of truth for the metrics and filter keys that the query API
// understands. The `litemetrics` CLI (`litemetrics metrics` / `litemetrics
// filters`), docs and any downstream consumer read from here so the documented
// surface never drifts from what the server actually supports.
//
// Keep in sync with:
//   - the `Metric` union in ./types.ts
//   - the filter column map in packages/node/src/adapters/*.ts

export type MetricCategory =
  | 'aggregate'
  | 'pages'
  | 'acquisition'
  | 'geo'
  | 'device'
  | 'events';

export interface MetricCatalogEntry {
  /** Metric id passed to `litemetrics stats <metric>` */
  metric: Metric;
  category: MetricCategory;
  description: string;
  /** Whether this metric is also available via `litemetrics timeseries <metric>` */
  timeseries?: boolean;
}

/** Every metric servable by `litemetrics stats <metric>`, grouped by category. */
export const METRIC_CATALOG: MetricCatalogEntry[] = [
  // Aggregate (single totals; support --compare and timeseries)
  { metric: 'pageviews', category: 'aggregate', description: 'Total pageviews', timeseries: true },
  { metric: 'visitors', category: 'aggregate', description: 'Unique visitors', timeseries: true },
  { metric: 'sessions', category: 'aggregate', description: 'Distinct sessions', timeseries: true },
  { metric: 'events', category: 'aggregate', description: 'Total custom events', timeseries: true },
  { metric: 'conversions', category: 'aggregate', description: 'Conversion events (per site config)', timeseries: true },

  // Pages & navigation
  { metric: 'top_pages', category: 'pages', description: 'Most viewed pages (by pageviews)' },
  { metric: 'top_exit_pages', category: 'pages', description: 'Last page per session' },
  { metric: 'top_transitions', category: 'pages', description: 'Page-to-page transitions (source → destination)' },
  { metric: 'top_scroll_pages', category: 'pages', description: 'Pages by scroll-depth events' },

  // Acquisition (referrers, channels, UTM)
  { metric: 'top_referrers', category: 'acquisition', description: 'Top referrer hostnames (normalized)' },
  { metric: 'top_channels', category: 'acquisition', description: 'Plausible-style channel classification' },
  { metric: 'top_utm_sources', category: 'acquisition', description: 'Top utm_source (normalized)' },
  { metric: 'top_utm_mediums', category: 'acquisition', description: 'Top utm_medium (normalized)' },
  { metric: 'top_utm_campaigns', category: 'acquisition', description: 'Top utm_campaign' },
  { metric: 'top_utm_terms', category: 'acquisition', description: 'Top utm_term (search keywords)' },
  { metric: 'top_utm_contents', category: 'acquisition', description: 'Top utm_content (A/B variant)' },

  // Geography
  { metric: 'top_countries', category: 'geo', description: 'Top countries by unique visitors' },
  { metric: 'top_cities', category: 'geo', description: 'Top cities by unique visitors' },

  // Device & platform
  { metric: 'top_devices', category: 'device', description: 'Device type (desktop/mobile/tablet)' },
  { metric: 'top_browsers', category: 'device', description: 'Browser breakdown' },
  { metric: 'top_os', category: 'device', description: 'Operating system breakdown' },
  { metric: 'top_os_versions', category: 'device', description: 'OS + version combinations' },
  { metric: 'top_device_models', category: 'device', description: 'Mobile device models (brand + model)' },
  { metric: 'top_app_versions', category: 'device', description: 'Mobile app version distribution' },

  // Custom events & interactions
  { metric: 'top_events', category: 'events', description: 'Top custom event names' },
  { metric: 'top_conversions', category: 'events', description: 'Top conversion event names' },
  { metric: 'top_button_clicks', category: 'events', description: 'Top button click targets' },
  { metric: 'top_link_targets', category: 'events', description: 'Top link / outbound click destinations' },
];

/** Set of valid `stats` metric ids, for fast validation. */
export const METRIC_IDS: Metric[] = METRIC_CATALOG.map((m) => m.metric);

/** Metric ids that `litemetrics timeseries <metric>` accepts. */
export const TIMESERIES_METRIC_IDS: Metric[] = METRIC_CATALOG
  .filter((m) => m.timeseries)
  .map((m) => m.metric);

export interface FilterKeyEntry {
  /** Filter key passed as `--filter <key>=<value>` */
  key: string;
  /** Human description */
  description: string;
  /** Example value */
  example: string;
}

/**
 * Every filter key accepted by `--filter key=value`. Filters are ANDed together
 * and matched by string equality. `channel` is computed (not a stored column).
 */
export const FILTER_KEYS: FilterKeyEntry[] = [
  { key: 'geo.country', description: 'Country (ISO code)', example: 'US' },
  { key: 'geo.region', description: 'Region / state', example: 'California' },
  { key: 'geo.city', description: 'City', example: 'London' },
  { key: 'language', description: 'Browser language', example: 'en' },
  { key: 'device.type', description: 'Device type', example: 'mobile' },
  { key: 'device.browser', description: 'Browser', example: 'Chrome' },
  { key: 'device.os', description: 'Operating system', example: 'iOS' },
  { key: 'device.osVersion', description: 'OS version', example: '17.1' },
  { key: 'device.deviceModel', description: 'Mobile device model', example: 'iPhone 14' },
  { key: 'device.deviceBrand', description: 'Mobile device brand', example: 'Apple' },
  { key: 'device.appVersion', description: 'Mobile app version', example: '1.2.0' },
  { key: 'utm.source', description: 'UTM source (normalized)', example: 'google' },
  { key: 'utm.medium', description: 'UTM medium (normalized)', example: 'cpc' },
  { key: 'utm.campaign', description: 'UTM campaign', example: 'launch-2026' },
  { key: 'utm.term', description: 'UTM term', example: 'analytics' },
  { key: 'utm.content', description: 'UTM content', example: 'banner-a' },
  { key: 'referrer', description: 'Referrer hostname (normalized)', example: 'news.ycombinator.com' },
  { key: 'channel', description: 'Computed channel (Paid Search, Organic Social, Direct, …)', example: 'Organic Search' },
  { key: 'event_source', description: 'Event source', example: 'manual' },
  { key: 'event_subtype', description: 'Event subtype', example: 'button_click' },
  { key: 'event_name', description: 'Custom event name', example: 'signup' },
  { key: 'page_path', description: 'Page path (from custom events)', example: '/pricing' },
  { key: 'target_url_path', description: 'Link / outbound click target', example: 'https://partner.com' },
  { key: 'type', description: 'Event type', example: 'pageview' },
];

/** Set of valid filter keys, for fast validation. */
export const FILTER_KEY_IDS: string[] = FILTER_KEYS.map((f) => f.key);
