import type {
  ClientEvent,
  TimestampOutOfWindowReason,
  TimestampSanityConfig,
} from '@litemetrics/core';

export const DEFAULT_TIMESTAMP_SANITY: Required<
  Omit<TimestampSanityConfig, 'onOutOfWindow'>
> & { onOutOfWindow: NonNullable<TimestampSanityConfig['onOutOfWindow']> } = {
  futureMs: 5 * 60 * 1000,
  pastMs: 24 * 60 * 60 * 1000,
  mode: 'drop',
  onOutOfWindow: () => {},
};

export type ResolvedTimestampSanity = typeof DEFAULT_TIMESTAMP_SANITY;

export function resolveTimestampSanity(
  config?: TimestampSanityConfig,
): ResolvedTimestampSanity {
  if (!config) return DEFAULT_TIMESTAMP_SANITY;
  return {
    futureMs: config.futureMs ?? DEFAULT_TIMESTAMP_SANITY.futureMs,
    pastMs: config.pastMs ?? DEFAULT_TIMESTAMP_SANITY.pastMs,
    mode: config.mode ?? DEFAULT_TIMESTAMP_SANITY.mode,
    onOutOfWindow: config.onOutOfWindow ?? DEFAULT_TIMESTAMP_SANITY.onOutOfWindow,
  };
}

function notify(
  config: ResolvedTimestampSanity,
  reason: TimestampOutOfWindowReason,
  offsetMs: number,
  event: ClientEvent,
): void {
  try {
    config.onOutOfWindow({ reason, offsetMs, event });
  } catch {
    // Swallow operator callback errors so collection never breaks
  }
}

/**
 * Returns the sanitized timestamp, or `null` if the event should be dropped.
 * - `mode: 'drop'` — out-of-window or invalid events return null (caller filters)
 * - `mode: 'clamp'` — out-of-window or invalid events are replaced with `now`
 * - `mode: 'off'` — valid timestamps pass through; invalid still replaced with `now`
 */
export function sanitizeEventTimestamp(
  event: ClientEvent,
  now: number,
  config: ResolvedTimestampSanity,
): number | null {
  const timestamp = event.timestamp;
  const valid = typeof timestamp === 'number' && Number.isFinite(timestamp);

  if (!valid) {
    notify(config, 'invalid', 0, event);
    if (config.mode === 'drop') return null;
    return now;
  }

  if (config.mode === 'off') return timestamp;

  if (timestamp > now + config.futureMs) {
    notify(config, 'future', timestamp - (now + config.futureMs), event);
    return config.mode === 'drop' ? null : now;
  }
  if (timestamp < now - config.pastMs) {
    notify(config, 'past', now - config.pastMs - timestamp, event);
    return config.mode === 'drop' ? null : now;
  }
  return timestamp;
}
