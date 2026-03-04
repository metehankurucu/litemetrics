import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseFilters, resolveFormat, outputCSV } from './output';

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
