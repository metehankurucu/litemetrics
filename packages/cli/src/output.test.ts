import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseFilters, resolveFormat, outputCSV, nearest, invalidMetric } from './output';

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
