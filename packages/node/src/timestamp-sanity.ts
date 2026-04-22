import type { TimestampSanityConfig } from '@litemetrics/core';

export const DEFAULT_TIMESTAMP_SANITY: Required<TimestampSanityConfig> = {
  futureMs: 5 * 60 * 1000,
  pastMs: 24 * 60 * 60 * 1000,
  mode: 'clamp',
};

export function resolveTimestampSanity(
  config?: TimestampSanityConfig,
): Required<TimestampSanityConfig> {
  if (!config) return DEFAULT_TIMESTAMP_SANITY;
  return {
    futureMs: config.futureMs ?? DEFAULT_TIMESTAMP_SANITY.futureMs,
    pastMs: config.pastMs ?? DEFAULT_TIMESTAMP_SANITY.pastMs,
    mode: config.mode ?? DEFAULT_TIMESTAMP_SANITY.mode,
  };
}

export function sanitizeEventTimestamp(
  timestamp: unknown,
  now: number,
  config: Required<TimestampSanityConfig>,
): number {
  const valid = typeof timestamp === 'number' && Number.isFinite(timestamp);
  if (config.mode === 'off') return valid ? (timestamp as number) : now;
  if (!valid) return now;
  const value = timestamp as number;
  if (value > now + config.futureMs) return now;
  if (value < now - config.pastMs) return now;
  return value;
}
