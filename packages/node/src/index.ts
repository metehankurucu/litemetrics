export { createCollector } from './collector';
export type { Collector } from './collector';
export { ClickHouseAdapter } from './adapters/clickhouse';
export { MongoDBAdapter } from './adapters/mongodb';

// Re-export types from core
export type {
  CollectorConfig,
  DBConfig,
  DBAdapter,
  QueryParams,
  QueryResult,
  EnrichedEvent,
  Metric,
  Period,
  Site,
  CreateSiteRequest,
  UpdateSiteRequest,
  EventListParams,
  EventListResult,
  EventListItem,
  UserListParams,
  UserListResult,
  UserDetail,
} from '@litemetrics/core';
