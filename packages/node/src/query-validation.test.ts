import { describe, it, expect } from 'vitest';
import { InvalidQueryError, parseDateParam, validateDateRange } from './query-validation';

describe('parseDateParam', () => {
  it('accepts a plain YYYY-MM-DD date', () => {
    expect(parseDateParam('dateFrom', '2026-08-11')).toBe('2026-08-11');
  });

  it('accepts a full ISO timestamp', () => {
    expect(parseDateParam('dateTo', '2026-08-16T00:00:00.000Z')).toBe('2026-08-16T00:00:00.000Z');
  });

  it('passes undefined through (the param is optional)', () => {
    expect(parseDateParam('dateFrom', undefined)).toBeUndefined();
  });

  it('treats an empty value as absent rather than as a broken date', () => {
    expect(parseDateParam('dateTo', '')).toBeUndefined();
  });

  // 31 Aug 2026 production case: a CLI let `--json` be swallowed as the value of
  // --to, and the server carried it all the way to the adapter and answered 500.
  it('rejects a flag swallowed as a value, naming the parameter', () => {
    expect(() => parseDateParam('dateTo', '--json')).toThrow(/dateTo/);
    expect(() => parseDateParam('dateTo', '--json')).toThrow(InvalidQueryError);
  });

  it('rejects two dates crammed into one value', () => {
    expect(() => parseDateParam('dateFrom', '2026-08-11 2026-08-16')).toThrow(/dateFrom/);
  });

  it('rejects a value that is not a date at all', () => {
    expect(() => parseDateParam('dateFrom', 'yesterday')).toThrow(/dateFrom/);
  });

  it('rejects an impossible calendar date', () => {
    expect(() => parseDateParam('dateTo', '2026-13-45')).toThrow(/dateTo/);
  });

  // Express turns a repeated query param into an array; the old cast pretended it
  // was a string and handed the array to the adapter.
  it('rejects a repeated param (array value)', () => {
    expect(() => parseDateParam('dateFrom', ['2026-08-11', '2026-08-12'])).toThrow(/dateFrom/);
  });

  it('rejects a non-string scalar', () => {
    expect(() => parseDateParam('dateTo', 20260811)).toThrow(/dateTo/);
  });

  // The message can end up in an operator's log, so the echoed value must not be
  // able to open a second line or run away in length.
  it('never echoes a newline back into the message', () => {
    let message = '';
    try {
      parseDateParam('dateFrom', '2026-08-11\n14:59:31 GET /admin 200 1ms');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('dateFrom');
    expect(message.split('\n')).toHaveLength(1);
  });

  it('caps the echoed value so a huge param cannot bloat the response', () => {
    let message = '';
    try {
      parseDateParam('dateTo', 'x'.repeat(500));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message.length).toBeLessThan(160);
  });

  it('carries a 400 status so handlers do not have to guess', () => {
    try {
      parseDateParam('dateTo', '--json');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as InvalidQueryError).status).toBe(400);
    }
  });
});

describe('validateDateRange', () => {
  it('returns both dates for a well-formed custom range', () => {
    expect(
      validateDateRange({ period: 'custom', dateFrom: '2026-08-11', dateTo: '2026-08-16' }),
    ).toEqual({ dateFrom: '2026-08-11', dateTo: '2026-08-16' });
  });

  it('passes a non-custom period with no dates at all', () => {
    expect(validateDateRange({ period: '7d' })).toEqual({ dateFrom: undefined, dateTo: undefined });
  });

  it('requires dateTo when the period is custom', () => {
    expect(() => validateDateRange({ period: 'custom', dateFrom: '2026-08-11' })).toThrow(/dateTo/);
  });

  it('requires dateFrom when the period is custom', () => {
    expect(() => validateDateRange({ period: 'custom', dateTo: '2026-08-16' })).toThrow(/dateFrom/);
  });

  it('rejects a reversed range', () => {
    expect(() =>
      validateDateRange({ period: 'custom', dateFrom: '2026-08-16', dateTo: '2026-08-11' }),
    ).toThrow(/before/);
  });

  it('accepts a single-instant range (from equals to)', () => {
    expect(() =>
      validateDateRange({ period: 'custom', dateFrom: '2026-08-11', dateTo: '2026-08-11' }),
    ).not.toThrow();
  });

  it('still rejects a malformed date when the period is not custom', () => {
    expect(() => validateDateRange({ period: '30d', dateTo: '--json' })).toThrow(/dateTo/);
  });

  it('still rejects a reversed range when the period is not custom', () => {
    expect(() =>
      validateDateRange({ period: '30d', dateFrom: '2026-08-16', dateTo: '2026-08-11' }),
    ).toThrow(/before/);
  });

  it('treats an empty custom date as missing rather than as year zero', () => {
    expect(() => validateDateRange({ period: 'custom', dateFrom: '', dateTo: '2026-08-16' })).toThrow(
      /dateFrom/,
    );
  });
});
