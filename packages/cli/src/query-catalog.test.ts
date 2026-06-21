import { describe, it, expect } from 'vitest';
import type { Metric } from '@litemetrics/core';
import {
  METRIC_CATALOG,
  METRIC_IDS,
  TIMESERIES_METRIC_IDS,
  FILTER_KEYS,
  FILTER_KEY_IDS,
} from '@litemetrics/core';

// Every member of the `Metric` union, listed exactly once. TypeScript fails to
// compile this object if a metric is added to (or removed from) the union
// without updating it, so this is the compile-time half of the parity guard.
const ALL_METRICS: Record<Metric, true> = {
  pageviews: true,
  visitors: true,
  sessions: true,
  events: true,
  conversions: true,
  top_pages: true,
  top_referrers: true,
  top_countries: true,
  top_cities: true,
  top_events: true,
  top_conversions: true,
  top_exit_pages: true,
  top_transitions: true,
  top_scroll_pages: true,
  top_button_clicks: true,
  top_link_targets: true,
  top_devices: true,
  top_browsers: true,
  top_os: true,
  top_os_versions: true,
  top_device_models: true,
  top_app_versions: true,
  top_utm_sources: true,
  top_utm_mediums: true,
  top_utm_campaigns: true,
  top_utm_terms: true,
  top_utm_contents: true,
  top_channels: true,
};

const sorted = (xs: string[]) => [...xs].sort();

describe('METRIC_CATALOG parity', () => {
  it('covers the Metric union exactly (no missing, no extra)', () => {
    expect(sorted(METRIC_IDS)).toEqual(sorted(Object.keys(ALL_METRICS)));
  });

  it('has no duplicate metric ids', () => {
    expect(METRIC_IDS).toHaveLength(new Set(METRIC_IDS).size);
  });

  it('derives METRIC_IDS from the catalog entries', () => {
    expect(METRIC_IDS).toEqual(METRIC_CATALOG.map(m => m.metric));
  });

  it('marks only aggregate metrics as timeseries-capable', () => {
    expect(sorted(TIMESERIES_METRIC_IDS)).toEqual(
      sorted(['pageviews', 'visitors', 'sessions', 'events', 'conversions']),
    );
  });

  it('gives every entry a category and a description', () => {
    for (const entry of METRIC_CATALOG) {
      expect(entry.category).toBeTruthy();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

describe('FILTER_KEYS parity', () => {
  // Mirrors the FILTER_COLUMN_MAP keys (plus computed `channel`) accepted by the
  // node storage adapters. Update both together when the filterable surface
  // changes; this asserts the documented set never silently drifts.
  const EXPECTED_FILTER_KEYS = [
    'geo.country',
    'geo.region',
    'geo.city',
    'language',
    'device.type',
    'device.browser',
    'device.os',
    'device.osVersion',
    'device.deviceModel',
    'device.deviceBrand',
    'device.appVersion',
    'utm.source',
    'utm.medium',
    'utm.campaign',
    'utm.term',
    'utm.content',
    'referrer',
    'channel',
    'event_source',
    'event_subtype',
    'event_name',
    'page_path',
    'target_url_path',
    'type',
  ];

  it('matches the expected adapter filter surface exactly', () => {
    expect(sorted(FILTER_KEY_IDS)).toEqual(sorted(EXPECTED_FILTER_KEYS));
  });

  it('has no duplicate filter keys', () => {
    expect(FILTER_KEY_IDS).toHaveLength(new Set(FILTER_KEY_IDS).size);
  });

  it('derives FILTER_KEY_IDS from the catalog entries', () => {
    expect(FILTER_KEY_IDS).toEqual(FILTER_KEYS.map(f => f.key));
  });

  it('gives every filter key a description and an example', () => {
    for (const entry of FILTER_KEYS) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.example.length).toBeGreaterThan(0);
    }
  });
});
