import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under threshold', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 5 });
    for (let i = 0; i < 5; i++) {
      expect(rl.check('1.1.1.1')).toEqual({ limited: false, count: i + 1 });
    }
  });

  it('blocks the (max + 1)-th request inside the window', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 3 });
    rl.check('1.1.1.1');
    rl.check('1.1.1.1');
    rl.check('1.1.1.1');
    expect(rl.check('1.1.1.1')).toEqual({ limited: true, count: 4 });
  });

  it('expires entries past the window', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 2 });
    rl.check('1.1.1.1');
    rl.check('1.1.1.1');
    expect(rl.check('1.1.1.1').limited).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(rl.check('1.1.1.1')).toEqual({ limited: false, count: 1 });
  });

  it('isolates IPs', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 2 });
    rl.check('1.1.1.1');
    rl.check('1.1.1.1');
    expect(rl.check('1.1.1.1').limited).toBe(true);
    expect(rl.check('2.2.2.2').limited).toBe(false);
  });

  it('treats empty IP as unlimited (cannot identify, do not block real users behind misconfigured proxy)', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 1 });
    expect(rl.check('').limited).toBe(false);
    expect(rl.check('').limited).toBe(false);
  });

  it('caps internal map size to prevent memory growth', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 1, maxIps: 3 });
    rl.check('1.1.1.1');
    rl.check('2.2.2.2');
    rl.check('3.3.3.3');
    rl.check('4.4.4.4'); // triggers eviction of oldest
    expect(rl.size()).toBeLessThanOrEqual(3);
  });
});
