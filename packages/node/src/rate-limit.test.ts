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

  it('keeps per-IP counts independent across non-overlapping windows', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 5 });
    // IP A spends its window early.
    expect(rl.check('a').count).toBe(1);
    expect(rl.check('a').count).toBe(2);
    // Advance past A's window.
    vi.advanceTimersByTime(70_000);
    // IP B starts now: must see count=1, not influenced by A.
    expect(rl.check('b')).toEqual({ limited: false, count: 1 });
    // IP A's old timestamps are now expired, so its next request is also count=1.
    expect(rl.check('a')).toEqual({ limited: false, count: 1 });
  });

  it('keeps a request just inside the window (now - windowMs + 1 ms ago)', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 5 });
    rl.check('1.1.1.1'); // T=0
    // Advance to where the first ts is exactly windowMs - 1 ms old (still > cutoff).
    vi.advanceTimersByTime(60_000 - 1);
    expect(rl.check('1.1.1.1').count).toBe(2);
  });

  it('drops a request just past the window (now - windowMs - 1 ms ago)', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 5 });
    rl.check('1.1.1.1'); // T=0
    // Advance to where the original timestamp is now ms - windowMs - 1 ago → expired.
    vi.advanceTimersByTime(60_000 + 1);
    expect(rl.check('1.1.1.1').count).toBe(1);
  });

  it('reset() clears the entire map', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 1 });
    rl.check('1.1.1.1');
    rl.check('2.2.2.2');
    rl.check('3.3.3.3');
    expect(rl.size()).toBe(3);
    rl.reset();
    expect(rl.size()).toBe(0);
    // After reset, the same IP gets a fresh count.
    expect(rl.check('1.1.1.1')).toEqual({ limited: false, count: 1 });
  });

  it('forgets an evicted IP - its first new request returns count=1', () => {
    const rl = createRateLimiter({ windowMs: 60_000, maxEvents: 10, maxIps: 2 });
    rl.check('a');
    rl.check('a'); // a count=2, lastSeen=now
    vi.advanceTimersByTime(1);
    rl.check('b'); // b lastSeen=now
    vi.advanceTimersByTime(1);
    // a is now the oldest (lastSeen earliest); inserting c evicts a.
    rl.check('c');
    expect(rl.size()).toBeLessThanOrEqual(2);
    // a re-enters fresh.
    expect(rl.check('a')).toEqual({ limited: false, count: 1 });
  });
});
