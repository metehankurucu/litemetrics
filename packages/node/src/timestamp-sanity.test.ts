import { describe, it, expect, vi } from 'vitest';
import type { ClientEvent, TimestampOutOfWindowInfo } from '@litemetrics/core';
import {
  DEFAULT_TIMESTAMP_SANITY,
  resolveTimestampSanity,
  sanitizeEventTimestamp,
} from './timestamp-sanity';

function makeEvent(timestamp: unknown): ClientEvent {
  return {
    type: 'pageview',
    siteId: 'site_1',
    timestamp: timestamp as number,
    sessionId: 'sess_1',
    visitorId: 'vis_1',
    url: 'https://example.com/',
  };
}

describe('resolveTimestampSanity', () => {
  it('returns defaults when config is undefined', () => {
    expect(resolveTimestampSanity()).toEqual(DEFAULT_TIMESTAMP_SANITY);
  });

  it('merges partial config with defaults', () => {
    const resolved = resolveTimestampSanity({ futureMs: 1000 });
    expect(resolved.futureMs).toBe(1000);
    expect(resolved.pastMs).toBe(DEFAULT_TIMESTAMP_SANITY.pastMs);
    expect(resolved.mode).toBe(DEFAULT_TIMESTAMP_SANITY.mode);
    expect(typeof resolved.onOutOfWindow).toBe('function');
  });

  it('uses provided onOutOfWindow callback', () => {
    const cb = vi.fn();
    const resolved = resolveTimestampSanity({ onOutOfWindow: cb });
    expect(resolved.onOutOfWindow).toBe(cb);
  });

  it('default mode is drop', () => {
    expect(DEFAULT_TIMESTAMP_SANITY.mode).toBe('drop');
  });
});

describe('sanitizeEventTimestamp', () => {
  const now = 1_700_000_000_000;

  describe("mode: 'drop' (default)", () => {
    const config = DEFAULT_TIMESTAMP_SANITY;

    it('passes through in-window timestamp', () => {
      expect(sanitizeEventTimestamp(makeEvent(now - 60_000), now, config)).toBe(now - 60_000);
    });

    it('drops future timestamp beyond window', () => {
      expect(sanitizeEventTimestamp(makeEvent(now + 60 * 60 * 1000), now, config)).toBeNull();
    });

    it('drops past timestamp beyond window', () => {
      expect(
        sanitizeEventTimestamp(makeEvent(now - 7 * 24 * 60 * 60 * 1000), now, config),
      ).toBeNull();
    });

    it('allows timestamp exactly at future boundary', () => {
      expect(sanitizeEventTimestamp(makeEvent(now + config.futureMs), now, config)).toBe(
        now + config.futureMs,
      );
    });

    it('drops one ms past future boundary', () => {
      expect(sanitizeEventTimestamp(makeEvent(now + config.futureMs + 1), now, config)).toBeNull();
    });

    it('allows timestamp exactly at past boundary', () => {
      expect(sanitizeEventTimestamp(makeEvent(now - config.pastMs), now, config)).toBe(
        now - config.pastMs,
      );
    });

    it('drops one ms past past boundary', () => {
      expect(sanitizeEventTimestamp(makeEvent(now - config.pastMs - 1), now, config)).toBeNull();
    });

    it('drops NaN', () => {
      expect(sanitizeEventTimestamp(makeEvent(Number.NaN), now, config)).toBeNull();
    });

    it('drops Infinity', () => {
      expect(sanitizeEventTimestamp(makeEvent(Number.POSITIVE_INFINITY), now, config)).toBeNull();
    });

    it('drops undefined', () => {
      expect(sanitizeEventTimestamp(makeEvent(undefined), now, config)).toBeNull();
    });

    it('drops null', () => {
      expect(sanitizeEventTimestamp(makeEvent(null), now, config)).toBeNull();
    });

    it('drops string', () => {
      expect(sanitizeEventTimestamp(makeEvent('1700000000000'), now, config)).toBeNull();
    });
  });

  describe("mode: 'clamp'", () => {
    const config = resolveTimestampSanity({ mode: 'clamp' });

    it('passes through in-window timestamp', () => {
      expect(sanitizeEventTimestamp(makeEvent(now - 60_000), now, config)).toBe(now - 60_000);
    });

    it('replaces future beyond window with now', () => {
      expect(sanitizeEventTimestamp(makeEvent(now + 60 * 60 * 1000), now, config)).toBe(now);
    });

    it('replaces past beyond window with now', () => {
      expect(
        sanitizeEventTimestamp(makeEvent(now - 7 * 24 * 60 * 60 * 1000), now, config),
      ).toBe(now);
    });

    it('replaces NaN with now', () => {
      expect(sanitizeEventTimestamp(makeEvent(Number.NaN), now, config)).toBe(now);
    });

    it('replaces undefined with now', () => {
      expect(sanitizeEventTimestamp(makeEvent(undefined), now, config)).toBe(now);
    });
  });

  describe("mode: 'off'", () => {
    const config = resolveTimestampSanity({ mode: 'off' });

    it('passes through in-window value', () => {
      expect(sanitizeEventTimestamp(makeEvent(now - 1000), now, config)).toBe(now - 1000);
    });

    it('passes through far-future value', () => {
      const far = now + 365 * 24 * 60 * 60 * 1000;
      expect(sanitizeEventTimestamp(makeEvent(far), now, config)).toBe(far);
    });

    it('passes through far-past value', () => {
      expect(sanitizeEventTimestamp(makeEvent(0), now, config)).toBe(0);
    });

    it('still replaces NaN with now', () => {
      expect(sanitizeEventTimestamp(makeEvent(Number.NaN), now, config)).toBe(now);
    });

    it('still replaces undefined with now', () => {
      expect(sanitizeEventTimestamp(makeEvent(undefined), now, config)).toBe(now);
    });
  });

  describe('custom windows', () => {
    it('respects tight futureMs with clamp', () => {
      const config = resolveTimestampSanity({ futureMs: 60_000, mode: 'clamp' });
      expect(sanitizeEventTimestamp(makeEvent(now + 2 * 60_000), now, config)).toBe(now);
      expect(sanitizeEventTimestamp(makeEvent(now + 30_000), now, config)).toBe(now + 30_000);
    });

    it('respects tight pastMs with drop', () => {
      const config = resolveTimestampSanity({ pastMs: 60_000 });
      expect(sanitizeEventTimestamp(makeEvent(now - 2 * 60_000), now, config)).toBeNull();
      expect(sanitizeEventTimestamp(makeEvent(now - 30_000), now, config)).toBe(now - 30_000);
    });
  });

  describe('onOutOfWindow callback', () => {
    it('fires for future timestamps with reason="future" and positive offsetMs', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ mode: 'drop', onOutOfWindow: cb });
      const future = now + config.futureMs + 5000;
      sanitizeEventTimestamp(makeEvent(future), now, config);

      expect(cb).toHaveBeenCalledTimes(1);
      const info = cb.mock.calls[0]![0] as TimestampOutOfWindowInfo;
      expect(info.reason).toBe('future');
      expect(info.offsetMs).toBe(5000);
      expect(info.event.siteId).toBe('site_1');
    });

    it('fires for past timestamps with reason="past"', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ mode: 'drop', onOutOfWindow: cb });
      const past = now - config.pastMs - 3000;
      sanitizeEventTimestamp(makeEvent(past), now, config);

      expect(cb).toHaveBeenCalledTimes(1);
      const info = cb.mock.calls[0]![0] as TimestampOutOfWindowInfo;
      expect(info.reason).toBe('past');
      expect(info.offsetMs).toBe(3000);
    });

    it('fires for invalid timestamps with reason="invalid"', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ onOutOfWindow: cb });
      sanitizeEventTimestamp(makeEvent(Number.NaN), now, config);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]![0].reason).toBe('invalid');
      expect(cb.mock.calls[0]![0].offsetMs).toBe(0);
    });

    it('does not fire for in-window timestamps', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ onOutOfWindow: cb });
      sanitizeEventTimestamp(makeEvent(now - 1000), now, config);
      expect(cb).not.toHaveBeenCalled();
    });

    it('fires in clamp mode too', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ mode: 'clamp', onOutOfWindow: cb });
      sanitizeEventTimestamp(makeEvent(now + 10 * 60 * 1000), now, config);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]![0].reason).toBe('future');
    });

    it('does not fire in off mode for out-of-window valid values', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ mode: 'off', onOutOfWindow: cb });
      sanitizeEventTimestamp(makeEvent(now + 365 * 24 * 60 * 60 * 1000), now, config);
      expect(cb).not.toHaveBeenCalled();
    });

    it('still fires in off mode for invalid values', () => {
      const cb = vi.fn();
      const config = resolveTimestampSanity({ mode: 'off', onOutOfWindow: cb });
      sanitizeEventTimestamp(makeEvent(Number.NaN), now, config);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]![0].reason).toBe('invalid');
    });

    it('swallows callback errors so collection is not disrupted', () => {
      const cb = vi.fn(() => {
        throw new Error('operator bug');
      });
      const config = resolveTimestampSanity({ mode: 'drop', onOutOfWindow: cb });
      expect(() =>
        sanitizeEventTimestamp(makeEvent(Number.NaN), now, config),
      ).not.toThrow();
    });
  });
});
