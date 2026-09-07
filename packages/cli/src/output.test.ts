import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseFilters,
  resolveFormat,
  outputCSV,
  outputJSON,
  nearest,
  invalidMetric,
  validatePeriod,
  assertDateFlag,
  errorEnvelope,
  handleError,
  resolveCompact,
  setCompactMode,
  PERIODS,
} from './output';

describe('parseFilters', () => {
  it('parses key=value pairs', () => {
    expect(parseFilters(['country=US', 'browser=Chrome'])).toEqual({
      country: 'US',
      browser: 'Chrome',
    });
  });

  it('returns undefined for empty array', () => {
    expect(parseFilters([])).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseFilters(undefined)).toBeUndefined();
  });

  it('handles value containing equals sign', () => {
    expect(parseFilters(['query=a=b'])).toEqual({ query: 'a=b' });
  });

  it('skips entries without equals sign', () => {
    expect(parseFilters(['noequals'])).toBeUndefined();
  });

  it('skips entries where key would be empty', () => {
    expect(parseFilters(['=value'])).toBeUndefined();
  });

  it('mixes valid and invalid entries', () => {
    expect(parseFilters(['country=US', 'bad', 'os=Linux'])).toEqual({
      country: 'US',
      os: 'Linux',
    });
  });
});

describe('resolveFormat', () => {
  const originalEnv = process.env.LITEMETRICS_FORMAT;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env.LITEMETRICS_FORMAT = originalEnv;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
  });

  it('returns json when explicitly passed', () => {
    expect(resolveFormat('json')).toBe('json');
  });

  it('returns table when explicitly passed', () => {
    expect(resolveFormat('table')).toBe('table');
  });

  it('returns csv when explicitly passed', () => {
    expect(resolveFormat('csv')).toBe('csv');
  });

  it('uses LITEMETRICS_FORMAT env var when no argument', () => {
    process.env.LITEMETRICS_FORMAT = 'json';
    expect(resolveFormat(undefined)).toBe('json');
  });

  it('returns table for TTY when no format specified', () => {
    delete process.env.LITEMETRICS_FORMAT;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
    expect(resolveFormat(undefined)).toBe('table');
  });

  it('returns json for non-TTY when no format specified', () => {
    delete process.env.LITEMETRICS_FORMAT;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    expect(resolveFormat(undefined)).toBe('json');
  });
});

describe('outputCSV', () => {
  it('escapes values with commas', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputCSV(['name'], [['hello, world']]);
    expect(spy).toHaveBeenCalledWith('"hello, world"');
    spy.mockRestore();
  });

  it('escapes values with double quotes', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputCSV(['name'], [['say "hi"']]);
    expect(spy).toHaveBeenCalledWith('"say ""hi"""');
    spy.mockRestore();
  });

  it('escapes values with newlines', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputCSV(['name'], [['line1\nline2']]);
    expect(spy).toHaveBeenCalledWith('"line1\nline2"');
    spy.mockRestore();
  });

  it('does not escape plain values', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputCSV(['name'], [['hello']]);
    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
  });
});

// ─── R6: compact JSON ────────────────────────────────

describe('compact JSON output', () => {
  const orig = process.env.LITEMETRICS_COMPACT;
  afterEach(() => {
    setCompactMode(false);
    if (orig === undefined) delete process.env.LITEMETRICS_COMPACT;
    else process.env.LITEMETRICS_COMPACT = orig;
    vi.restoreAllMocks();
  });

  it('resolveCompact is true when the flag is passed', () => {
    delete process.env.LITEMETRICS_COMPACT;
    expect(resolveCompact(true)).toBe(true);
  });

  it('resolveCompact honors LITEMETRICS_COMPACT=1 with no flag', () => {
    process.env.LITEMETRICS_COMPACT = '1';
    expect(resolveCompact(undefined)).toBe(true);
  });

  it('resolveCompact honors LITEMETRICS_COMPACT=true with no flag', () => {
    process.env.LITEMETRICS_COMPACT = 'true';
    expect(resolveCompact(undefined)).toBe(true);
  });

  it('resolveCompact ignores other LITEMETRICS_COMPACT values (e.g. 0)', () => {
    process.env.LITEMETRICS_COMPACT = '0';
    expect(resolveCompact(undefined)).toBe(false);
  });

  it('resolveCompact is false by default', () => {
    delete process.env.LITEMETRICS_COMPACT;
    expect(resolveCompact(undefined)).toBe(false);
  });

  it('outputJSON pretty-prints by default (multi-line, 2-space)', () => {
    setCompactMode(false);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputJSON({ a: 1, b: [2, 3] });
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
    expect((spy.mock.calls[0][0] as string)).toContain('\n');
  });

  it('outputJSON emits a single line when compact mode is on, and it parses', () => {
    setCompactMode(true);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    outputJSON({ a: 1, b: [2, 3] });
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({ a: 1, b: [2, 3] });
  });
});

describe('nearest', () => {
  const metrics = ['pageviews', 'visitors', 'sessions', 'top_pages', 'top_browsers'];

  it('ranks an exact substring match first', () => {
    expect(nearest('page', metrics)[0]).toBe('pageviews');
  });

  it('finds the closest by edit distance for a typo', () => {
    expect(nearest('visiters', metrics)[0]).toBe('visitors');
  });

  it('returns at most n suggestions', () => {
    expect(nearest('top', metrics, 2)).toHaveLength(2);
  });

  it('defaults to at most 3 suggestions', () => {
    expect(nearest('top', metrics).length).toBeLessThanOrEqual(3);
  });

  it('does not throw on empty input and still returns at most 3', () => {
    const result = nearest('', metrics);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.every(r => metrics.includes(r))).toBe(true);
  });

  it('does not throw on garbage input far from every candidate', () => {
    const result = nearest('zzzzzzzz', metrics);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.every(r => metrics.includes(r))).toBe(true);
  });

  it('returns an empty array when there are no candidates', () => {
    expect(nearest('anything', [])).toEqual([]);
  });
});

describe('invalidMetric', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits 1 with suggestions and a JSON error payload', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => invalidMetric('pageview', ['pageviews', 'visitors'], 'json', 'litemetrics metrics')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.suggestions).toContain('pageviews');
    expect(payload.error).toContain('pageview');
  });

  it('writes a human-readable error in non-json mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => invalidMetric('pageview', ['pageviews'], 'table', 'litemetrics metrics')).toThrow('exit');
    expect(errSpy.mock.calls[0][0]).toContain('Did you mean');
  });
});

// ─── R1: period validation ───────────────────────────

describe('validatePeriod', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockExit = () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  };

  it('accepts every value in the enum', () => {
    mockExit();
    for (const p of PERIODS) {
      // custom needs from/to; supply them so only the enum membership is under test
      expect(() => validatePeriod(p, '2026-01-01', '2026-02-01', 'json')).not.toThrow();
    }
  });

  it('accepts an undefined period (commander default applies)', () => {
    mockExit();
    expect(() => validatePeriod(undefined, undefined, undefined, 'json')).not.toThrow();
  });

  it('rejects a value outside the enum with exit 1 and suggestions (json envelope)', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('14d', undefined, undefined, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toContain('14d');
    expect(Array.isArray(payload.suggestions)).toBe(true);
    // '14d' is closest to the day-based tokens
    expect(payload.suggestions.length).toBeGreaterThan(0);
  });

  it('rejects an unknown period in table mode with a human-readable line', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('1y', undefined, undefined, 'table')).toThrow('exit');
    expect(errSpy.mock.calls[0][0]).toContain('Invalid period');
    expect(errSpy.mock.calls[0][0]).toContain('1y');
  });

  it('rejects custom without --from', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('custom', undefined, '2026-02-01', 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toContain('custom');
    expect(payload.error).toContain('--from');
  });

  it('rejects custom without --to', () => {
    mockExit();
    expect(() => validatePeriod('custom', '2026-01-01', undefined, 'json')).toThrow('exit');
  });

  it('accepts custom with both --from and --to', () => {
    mockExit();
    expect(() => validatePeriod('custom', '2026-01-01', '2026-02-01', 'json')).not.toThrow();
  });
});

// ─── R5: error envelope + strict format ──────────────

describe('errorEnvelope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits {error} JSON and exits 1 in json mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    expect(() => errorEnvelope('boom', 'json')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(JSON.parse(errSpy.mock.calls[0][0] as string)).toEqual({ error: 'boom' });
  });

  it('includes suggestions only when non-empty', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    expect(() => errorEnvelope('boom', 'json', { suggestions: ['a', 'b'] })).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string)).toEqual({ error: 'boom', suggestions: ['a', 'b'] });
  });

  it('prints a prose line in table mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    expect(() => errorEnvelope('boom', 'table')).toThrow('exit');
    expect(errSpy.mock.calls[0][0]).toBe('Error: boom');
  });
});

// ─── R4: error transparency ──────────────────────────

describe('handleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockExit = () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    return { exitSpy, errSpy };
  };

  it('surfaces the server error message (response.data.error) over the axios message, with status', () => {
    const { errSpy } = mockExit();
    const axiosErr = {
      message: 'Request failed with status code 401',
      response: { status: 401, data: { ok: false, error: 'Unauthorized - invalid or missing admin secret' } },
    };
    expect(() => handleError(axiosErr, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toBe('Unauthorized - invalid or missing admin secret');
    expect(payload.status).toBe(401);
  });

  it('falls back to response.data.message when there is no data.error', () => {
    const { errSpy } = mockExit();
    const axiosErr = {
      message: 'Request failed with status code 404',
      response: { status: 404, data: { message: 'Site not found' } },
    };
    expect(() => handleError(axiosErr, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toBe('Site not found');
    expect(payload.status).toBe(404);
  });

  it('prefers data.error when BOTH data.error and data.message are present', () => {
    const { errSpy } = mockExit();
    const axiosErr = {
      message: 'Request failed with status code 400',
      response: { status: 400, data: { error: 'the real cause', message: 'generic' } },
    };
    expect(() => handleError(axiosErr, 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toBe('the real cause');
  });

  it('falls back to err.message for a network error with no response (no status field)', () => {
    const { errSpy } = mockExit();
    const netErr = new Error('connect ECONNREFUSED 127.0.0.1:3000');
    expect(() => handleError(netErr, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toBe('connect ECONNREFUSED 127.0.0.1:3000');
    expect(payload).not.toHaveProperty('status');
  });

  it('surfaces err.code when a network error has a blank message (dual-stack ECONNREFUSED)', () => {
    const { errSpy } = mockExit();
    // Real axios ECONNREFUSED against a host that resolves to both ::1 and
    // 127.0.0.1 (e.g. localhost) wraps a Node AggregateError: the AxiosError is
    // an Error instance whose `message` is '' but whose `code` carries the useful
    // signal. A raw err.message fallback would emit {"error":""}.
    const netErr = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
    expect(() => handleError(netErr, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toBe('ECONNREFUSED');
    expect(payload).not.toHaveProperty('status');
  });

  it('prefers a populated err.message over err.code', () => {
    const { errSpy } = mockExit();
    const netErr = Object.assign(new Error('connect ETIMEDOUT 10.0.0.1:443'), { code: 'ETIMEDOUT' });
    expect(() => handleError(netErr, 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toBe('connect ETIMEDOUT 10.0.0.1:443');
  });

  it('surfaces the server message and HTTP status in table mode too', () => {
    const { errSpy } = mockExit();
    const axiosErr = {
      message: 'Request failed with status code 401',
      response: { status: 401, data: { error: 'Unauthorized - invalid or missing admin secret' } },
    };
    expect(() => handleError(axiosErr, 'table')).toThrow('exit');
    const line = errSpy.mock.calls[0][0] as string;
    expect(line).toContain('Unauthorized - invalid or missing admin secret');
    expect(line).toContain('401');
    expect(() => JSON.parse(line)).toThrow();
  });

  it('exits 1', () => {
    const { exitSpy } = mockExit();
    expect(() => handleError(new Error('boom'), 'json')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('ignores a blank server data.error and keeps the axios message', () => {
    const { errSpy } = mockExit();
    // real AxiosError is an Error instance; a blank data.error must not win
    const axiosErr = Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500, data: { error: '' } },
    });
    expect(() => handleError(axiosErr, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toBe('Request failed with status code 500');
    expect(payload.status).toBe(500);
  });
});

describe('resolveFormat (strict)', () => {
  const originalEnv = process.env.LITEMETRICS_FORMAT;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env.LITEMETRICS_FORMAT = originalEnv;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
    vi.restoreAllMocks();
  });

  it('rejects an invalid explicit format with exit 1 and an envelope', () => {
    delete process.env.LITEMETRICS_FORMAT;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    expect(() => resolveFormat('xml')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    // non-TTY, no env → error is emitted as JSON
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toContain('xml');
  });
});

// ─── D1: --from / --to must be dates ─────────────────
// 31 Aug 2026: `--to` swallowed the next flag (`--json`) as its value, the CLI sent
// it as-is, and the server answered 500. The value never was a date, and the CLI can
// see that before a request goes out.
describe('assertDateFlag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockExit = () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  };

  it('accepts an ISO day', () => {
    mockExit();
    expect(() => assertDateFlag('--from', '2026-08-11', 'json')).not.toThrow();
  });

  it('accepts a full ISO timestamp', () => {
    mockExit();
    expect(() => assertDateFlag('--to', '2026-08-16T00:00:00.000Z', 'json')).not.toThrow();
  });

  it('accepts an omitted flag', () => {
    mockExit();
    expect(() => assertDateFlag('--from', undefined, 'json')).not.toThrow();
  });

  it('rejects a swallowed flag and says so', () => {
    const errSpy = mockExit();
    expect(() => assertDateFlag('--to', '--json', 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toContain('--to');
    expect(payload.error).toContain('looks like another flag');
  });

  it('rejects a value that is not a date', () => {
    const errSpy = mockExit();
    expect(() => assertDateFlag('--from', 'lastweek', 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toContain('must be an ISO date');
  });

  it('rejects an impossible calendar date', () => {
    mockExit();
    expect(() => assertDateFlag('--to', '2026-13-45', 'json')).toThrow('exit');
  });

  it('rejects two dates crammed into one value', () => {
    const errSpy = mockExit();
    expect(() => assertDateFlag('--from', '2026-08-11 2026-08-16', 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toContain('must be an ISO date');
  });

  it('reports in prose when the format is not json', () => {
    const errSpy = mockExit();
    expect(() => assertDateFlag('--to', '--json', 'table')).toThrow('exit');
    expect(errSpy.mock.calls[0][0]).toContain('Error:');
    expect(errSpy.mock.calls[0][0]).toContain('--to');
  });
});

describe('validatePeriod date flags', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockExit = () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  };

  it('rejects a two-date --from on a custom period', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('custom', '2026-08-11 2026-08-16', '--json', 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toContain('--from');
  });

  it('rejects a swallowed --from even when the period is not custom', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('30d', '--json', undefined, 'table')).toThrow('exit');
    expect(errSpy.mock.calls[0][0]).toContain('--from');
  });

  it('rejects a swallowed --to even when the period is not custom', () => {
    mockExit();
    expect(() => validatePeriod('30d', undefined, '--json', 'json')).toThrow('exit');
  });

  it('rejects a bad --from when the period was left to the command default', () => {
    mockExit();
    expect(() => validatePeriod(undefined, 'yesterday', undefined, 'json')).toThrow('exit');
  });

  it('still accepts a well-formed custom range', () => {
    mockExit();
    expect(() => validatePeriod('custom', '2026-08-11', '2026-08-16', 'json')).not.toThrow();
  });

  it('still reports the missing-half error for custom with a valid --from only', () => {
    const errSpy = mockExit();
    expect(() => validatePeriod('custom', '2026-08-11', undefined, 'json')).toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toContain('--to');
  });
});
