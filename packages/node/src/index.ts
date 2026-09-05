export { createCollector } from './collector';
export type { Collector } from './collector';
export { ClickHouseAdapter } from './adapters/clickhouse';
export { MongoDBAdapter } from './adapters/mongodb';
export { isBot, isSignatureBot, classifyUserAgent, type SignatureBotReason } from './botfilter';
export {
  isHeuristicBot,
  classifyHeuristicBot,
  type HeuristicBotInput,
  type HeuristicBotReason,
} from './heuristic-bot';
export { createRateLimiter, type RateLimiter, type RateLimiterConfig, type RateLimitResult } from './rate-limit';
export {
  InvalidQueryError,
  parseDateParam,
  validateDateRange,
  type DateParamName,
} from './query-validation';

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
  BotFilterMode,
  BotFilterConfig,
  BotDetectedInfo,
  BotDropReason,
  SiteTypeMismatchInfo,
  CollectErrorInfo,
  CollectErrorStage,
} from '@litemetrics/core';
