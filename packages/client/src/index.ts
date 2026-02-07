export { LitemetricsClient, createClient } from './client';
export type { LitemetricsClientConfig, StatsOptions, TimeSeriesOptions, EventsListOptions, UsersListOptions, RetentionOptions } from './client';

export { SitesClient, createSitesClient } from './sites';
export type { SitesClientConfig } from './sites';

// Re-export query types from core
export type {
  Metric,
  Period,
  QueryResult,
  QueryDataPoint,
  Site,
  CreateSiteRequest,
  UpdateSiteRequest,
  EventType,
  EventListParams,
  EventListResult,
  EventListItem,
  UserListParams,
  UserListResult,
  UserDetail,
  Granularity,
  TimeSeriesParams,
  TimeSeriesResult,
  TimeSeriesPoint,
  RetentionParams,
  RetentionResult,
  RetentionCohort,
} from '@litemetrics/core';
