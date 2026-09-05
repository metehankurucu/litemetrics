import { describe, it, expect } from 'vitest';
import {
  sanitizeUserAgent,
  sanitizeToken,
  formatBotFilterLine,
  formatSiteTypeMismatchLine,
  formatAccessLine,
  formatCollectErrorLine,
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

describe('formatSiteTypeMismatchLine', () => {
  it('names the site, its type, the declared platform and the mode', () => {
    const line = formatSiteTypeMismatchLine({
      siteId: 'site_5dv1pv4y3714',
      siteType: 'web',
      platform: 'android',
      mode: 'standard',
    });
    expect(line).toBe(
      '[site-type-mismatch] site=site_5dv1pv4y3714 type=web platform=android mode=standard - app SDK events on a non-app site are still filtered as browser traffic',
    );
  });

  it('shows a never-set type as unset', () => {
    const line = formatSiteTypeMismatchLine({
      siteId: 'site_x', siteType: undefined, platform: 'ios', mode: 'strict',
    });
    expect(line).toContain('type=unset');
  });

  it('does not claim a drop when the mode is off', () => {
    const line = formatSiteTypeMismatchLine({
      siteId: 'site_x', siteType: 'web', platform: 'android', mode: 'off',
    });
    expect(line).toContain('mode=off');
    expect(line).not.toContain('still filtered');
  });

  // `platform` is a field the request body declares, so it is attacker-controlled
  // just like the User-Agent: a newline in it must not become a second log entry.
  it('stays a single line and caps a hostile platform value', () => {
    const line = formatSiteTypeMismatchLine({
      siteId: 'site_x',
      siteType: 'web',
      platform: 'android\n[bot-filter] dropped ' + 'x'.repeat(200),
      mode: 'standard',
    });
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toMatch(/platform=android\[bot-filter\]droppedx{0,32} mode=standard/);
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

  it('marks a request the client abandoned before the answer went out', () => {
    const line = formatAccessLine({
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: '/api/stats?siteId=site_x',
      statusCode: 200,
      durationMs: 190,
      auth: '[secret]',
      aborted: true,
    });
    expect(line).toBe('07:30:41 GET /api/stats?siteId=site_x 200 190ms [secret] aborted');
  });

  it('adds no marker when aborted is omitted or false', () => {
    const base = {
      timestamp: Date.parse('2026-08-16T07:30:41.000Z'),
      method: 'GET',
      url: '/health',
      statusCode: 200,
      durationMs: 1,
      auth: '',
    };
    expect(formatAccessLine(base)).toBe('07:30:41 GET /health 200 1ms');
    expect(formatAccessLine({ ...base, aborted: false })).toBe('07:30:41 GET /health 200 1ms');
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

// ─── O1: the line behind a collect 5xx ────────────────
describe('formatCollectErrorLine', () => {
  const base = {
    stage: 'insert' as const,
    errorClass: 'ECONNRESET',
    message: 'connect ECONNRESET 10.0.0.4:8123',
    siteId: 'site_abc',
    eventCount: 3,
  };

  it('names the stage, class, site, batch size and message', () => {
    expect(formatCollectErrorLine(base)).toBe(
      '[collect-error] stage=insert class=ECONNRESET site=site_abc events=3 msg="connect ECONNRESET 10.0.0.4:8123"',
    );
  });

  it('shows a dash for a site and a count that were never resolved', () => {
    const line = formatCollectErrorLine({
      stage: 'parse',
      errorClass: 'SyntaxError',
      message: 'Unexpected end of JSON input',
    });
    expect(line).toContain('site=-');
    expect(line).toContain('events=-');
  });

  // The message comes from a driver, and a driver can quote back whatever the request
  // contained, so it is attacker-reachable text going into a log line.
  it('stays a single line when the message carries a newline', () => {
    const line = formatCollectErrorLine({
      ...base,
      message: 'boom\n[collect] minute=2026-09-05T00:00 reqs=1 ok=1',
    });
    expect(line.split('\n')).toHaveLength(1);
  });

  it('keeps the msg field parseable when the message contains a quote', () => {
    const line = formatCollectErrorLine({ ...base, message: 'relation "events" does not exist' });
    expect(line).toContain(`msg="relation 'events' does not exist"`);
    expect(line.match(/"/g)).toHaveLength(2);
  });

  it('caps a runaway message', () => {
    const line = formatCollectErrorLine({ ...base, message: 'x'.repeat(400) });
    expect(line).toContain('...');
    expect(line.length).toBeLessThan(280);
  });

  // A connection error can quote the DSN back, and the DSN carries the password.
  it('redacts credentials a driver quoted back from a connection string', () => {
    const line = formatCollectErrorLine({
      ...base,
      message: 'connect ECONNREFUSED postgres://lm_user:s3cr3t-pw@db.internal:5432/litemetrics',
    });
    expect(line).not.toContain('s3cr3t-pw');
    expect(line).not.toContain('lm_user');
    expect(line).toContain('postgres://***@db.internal:5432/litemetrics');
  });

  it('sanitizes a class value that is not a plain token', () => {
    const line = formatCollectErrorLine({ ...base, errorClass: 'ECONN RESET\nfake=1' });
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('class=ECONNRESETfake=1');
  });

  it('sanitizes a site id that is not a plain token', () => {
    const line = formatCollectErrorLine({ ...base, siteId: 'site_a b\nc' });
    expect(line.split('\n')).toHaveLength(1);
  });
});
