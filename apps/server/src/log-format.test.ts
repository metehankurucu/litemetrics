import { describe, it, expect } from 'vitest';
import {
  sanitizeUserAgent,
  sanitizeToken,
  formatBotFilterLine,
  formatAccessLine,
} from './log-format';

describe('sanitizeUserAgent', () => {
  it('passes a real User-Agent through unchanged', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(sanitizeUserAgent(ua)).toBe(ua);
  });

  it('keeps the OkHttp default UA readable - the value this whole field exists to surface', () => {
    expect(sanitizeUserAgent('okhttp/4.12.0')).toBe('okhttp/4.12.0');
  });

  // The User-Agent is attacker-controlled and goes straight into a log line, so a
  // newline in it would let a single request forge log entries.
  it('neutralizes newlines so a request cannot inject a fake log line', () => {
    const injected = 'evil\n[bot-filter] dropped layer=signature site=site_fake';
    const out = sanitizeUserAgent(injected);
    expect(out).not.toContain('\n');
    expect(out).not.toContain('\r');
    expect(out).toBe('evil [bot-filter] dropped layer=signature site=site_fake');
  });

  it('strips other control characters', () => {
    expect(sanitizeUserAgent('a\u0000b\u001fc\u007fd')).toBe('a b c d');
  });

  it('replaces double quotes so the ua="..." field stays parseable', () => {
    expect(sanitizeUserAgent('curl/8.0 "quoted"')).toBe("curl/8.0 'quoted'");
  });

  it('truncates an oversized UA and marks it', () => {
    const out = sanitizeUserAgent('x'.repeat(500), 200);
    expect(out).toHaveLength(203);
    expect(out.endsWith('...')).toBe(true);
  });

  it('does not split a surrogate pair when truncating', () => {
    const out = sanitizeUserAgent('\u{1F600}'.repeat(10), 4);
    expect(out).toBe('\u{1F600}\u{1F600}\u{1F600}\u{1F600}...');
  });

  it.each([
    [undefined, 'undefined'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['\n\t', 'control characters only'],
  ])('renders %s (%s) as a dash', (input: string | undefined, _label: string) => {
    expect(sanitizeUserAgent(input)).toBe('-');
  });
});

describe('sanitizeToken', () => {
  // siteId comes from the client's JSON payload and ip can come from an
  // X-Forwarded-For header, so both are attacker-controlled too.
  it('drops whitespace and control characters entirely', () => {
    expect(sanitizeToken('site_abc\ndef ghi')).toBe('site_abcdefghi');
  });

  it('keeps an IPv6 address intact', () => {
    expect(sanitizeToken('2a02:e0:ff10:1::1')).toBe('2a02:e0:ff10:1::1');
  });

  it('caps length so one request cannot blow up a log line', () => {
    expect(sanitizeToken('a'.repeat(500), 64)).toHaveLength(64);
  });

  it('marks the cut when a marker is asked for', () => {
    expect(sanitizeToken('a'.repeat(500), 8, '...')).toBe('aaaaaaaa...');
    expect(sanitizeToken('short', 8, '...')).toBe('short');
  });

  it.each([[undefined], ['']])('renders %s as a dash', (input) => {
    expect(sanitizeToken(input as string | undefined)).toBe('-');
  });
});

describe('formatBotFilterLine', () => {
  it('carries reason and ua alongside the existing fields', () => {
    const line = formatBotFilterLine({
      action: 'dropped',
      layer: 'signature',
      reason: 'ua-signature',
      mode: 'standard',
      siteId: 'site_5dv1pv4y3714',
      ip: '172.71.150.31',
      userAgent: 'okhttp/4.12.0',
    });
    expect(line).toBe(
      '[bot-filter] dropped layer=signature reason=ua-signature mode=standard site=site_5dv1pv4y3714 ip=172.71.150.31 ua="okhttp/4.12.0"',
    );
  });

  it('shows a missing UA as a dash rather than an empty field', () => {
    const line = formatBotFilterLine({
      action: 'dropped',
      layer: 'signature',
      reason: 'empty-ua',
      mode: 'standard',
      siteId: 'site_x',
      ip: '1.2.3.4',
      userAgent: '',
    });
    expect(line).toContain('reason=empty-ua');
    expect(line).toContain('ua="-"');
  });

  it('stays a single line even when every field is hostile', () => {
    const line = formatBotFilterLine({
      action: 'flagged',
      layer: 'heuristic',
      reason: 'no-browser-signals',
      mode: 'shadow',
      siteId: 'site\nfake',
      ip: '1.1.1.1\nfake',
      userAgent: 'ua\nfake',
    });
    expect(line.split('\n')).toHaveLength(1);
  });
});

describe('formatAccessLine', () => {
  it('includes the status code and the duration', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T14:59:31.000Z'),
      method: 'GET',
      url: '/api/stats?siteId=site_x',
      statusCode: 200,
      durationMs: 42.4,
      auth: '[secret]',
    });
    expect(line).toBe('14:59:31 GET /api/stats?siteId=site_x 200 42ms [secret]');
  });

  it('leaves no trailing space when the request is unauthenticated', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: '/health',
      statusCode: 200,
      durationMs: 1.2,
      auth: '',
    });
    expect(line).toBe('07:30:41 GET /health 200 1ms');
  });

  it('rounds sub-millisecond durations to a whole number', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: '/health',
      statusCode: 500,
      durationMs: 0.4,
      auth: '',
    });
    expect(line).toContain(' 500 0ms');
  });

  it('marks a truncated URL so it cannot be read as a real path', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: `/api/events?q=${'x'.repeat(400)}`,
      statusCode: 200,
      durationMs: 1,
      auth: '',
    });
    expect(line).toContain('...');
    expect(line.split(' ')[2]).toHaveLength(203);
  });

  it('stays a single line for a hostile URL', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: '/x\n14:59:31 GET /admin 200 1ms',
      statusCode: 404,
      durationMs: 1,
      auth: '',
    });
    expect(line.split('\n')).toHaveLength(1);
  });
});
