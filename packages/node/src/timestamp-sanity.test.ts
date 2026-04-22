import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIMESTAMP_SANITY,
  resolveTimestampSanity,
  sanitizeEventTimestamp,
} from './timestamp-sanity';

describe('resolveTimestampSanity', () => {
  it('returns defaults when config is undefined', () => {
    expect(resolveTimestampSanity()).toEqual(DEFAULT_TIMESTAMP_SANITY);
  });

  it('merges partial config with defaults', () => {
    expect(resolveTimestampSanity({ futureMs: 1000 })).toEqual({
      futureMs: 1000,
      pastMs: DEFAULT_TIMESTAMP_SANITY.pastMs,
      mode: DEFAULT_TIMESTAMP_SANITY.mode,
    });
  });

  it('passes through full config', () => {
    const full = { futureMs: 1, pastMs: 2, mode: 'off' as const };
    expect(resolveTimestampSanity(full)).toEqual(full);
  });
});

describe('sanitizeEventTimestamp', () => {
  const now = 1_700_000_000_000;
  const config = DEFAULT_TIMESTAMP_SANITY;

  it('passes through in-window timestamp', () => {
    expect(sanitizeEventTimestamp(now - 60_000, now, config)).toBe(now - 60_000);
  });

  it('replaces future timestamp beyond window with now', () => {
    expect(sanitizeEventTimestamp(now + 60 * 60 * 1000, now, config)).toBe(now);
  });

  it('replaces past timestamp beyond window with now', () => {
    expect(sanitizeEventTimestamp(now - 7 * 24 * 60 * 60 * 1000, now, config)).toBe(now);
  });

  it('allows timestamp exactly at future boundary', () => {
    expect(sanitizeEventTimestamp(now + config.futureMs, now, config)).toBe(now + config.futureMs);
  });

  it('replaces timestamp one ms past future boundary', () => {
    expect(sanitizeEventTimestamp(now + config.futureMs + 1, now, config)).toBe(now);
  });

  it('allows timestamp exactly at past boundary', () => {
    expect(sanitizeEventTimestamp(now - config.pastMs, now, config)).toBe(now - config.pastMs);
  });

  it('replaces timestamp one ms past past boundary', () => {
    expect(sanitizeEventTimestamp(now - config.pastMs - 1, now, config)).toBe(now);
  });

  it('returns now for NaN', () => {
    expect(sanitizeEventTimestamp(Number.NaN, now, config)).toBe(now);
  });

  it('returns now for Infinity', () => {
    expect(sanitizeEventTimestamp(Number.POSITIVE_INFINITY, now, config)).toBe(now);
  });

  it('returns now for undefined', () => {
    expect(sanitizeEventTimestamp(undefined, now, config)).toBe(now);
  });

  it('returns now for null', () => {
    expect(sanitizeEventTimestamp(null, now, config)).toBe(now);
  });

  it('returns now for string', () => {
    expect(sanitizeEventTimestamp('1700000000000', now, config)).toBe(now);
  });

  describe("mode: 'off'", () => {
    const off = { ...config, mode: 'off' as const };

    it('passes through in-window value', () => {
      expect(sanitizeEventTimestamp(now - 1000, now, off)).toBe(now - 1000);
    });

    it('passes through far-future value', () => {
      expect(sanitizeEventTimestamp(now + 365 * 24 * 60 * 60 * 1000, now, off)).toBe(
        now + 365 * 24 * 60 * 60 * 1000,
      );
    });

    it('passes through far-past value', () => {
      expect(sanitizeEventTimestamp(0, now, off)).toBe(0);
    });

    it('still replaces NaN with now', () => {
      expect(sanitizeEventTimestamp(Number.NaN, now, off)).toBe(now);
    });

    it('still replaces undefined with now', () => {
      expect(sanitizeEventTimestamp(undefined, now, off)).toBe(now);
    });
  });

  describe('custom windows', () => {
    it('respects tight futureMs', () => {
      const tight = { futureMs: 60_000, pastMs: config.pastMs, mode: 'clamp' as const };
      expect(sanitizeEventTimestamp(now + 2 * 60_000, now, tight)).toBe(now);
      expect(sanitizeEventTimestamp(now + 30_000, now, tight)).toBe(now + 30_000);
    });

    it('respects tight pastMs', () => {
      const tight = { futureMs: config.futureMs, pastMs: 60_000, mode: 'clamp' as const };
      expect(sanitizeEventTimestamp(now - 2 * 60_000, now, tight)).toBe(now);
      expect(sanitizeEventTimestamp(now - 30_000, now, tight)).toBe(now - 30_000);
    });
  });
});
