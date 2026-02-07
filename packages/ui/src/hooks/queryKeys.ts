const PREFIX = 'litemetrics-ui' as const;

export const queryKeys = {
  stats: (siteId: string, metric: string, period: string, dateFrom?: string, dateTo?: string) =>
    [PREFIX, 'stats', siteId, metric, period, dateFrom, dateTo] as const,
  timeSeries: (siteId: string, metric: string, period: string) =>
    [PREFIX, 'timeSeries', siteId, metric, period] as const,
  overview: (siteId: string, period: string, dateFrom?: string, dateTo?: string) =>
    [PREFIX, 'overview', siteId, period, dateFrom, dateTo] as const,
  worldMap: (siteId: string, period: string) =>
    [PREFIX, 'worldMap', siteId, period] as const,
};
