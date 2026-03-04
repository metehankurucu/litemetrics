import { describe, it, expect } from 'vitest';
import { parseUserAgent } from './useragent';

describe('parseUserAgent', () => {
  it('parses Chrome on Windows as desktop', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(result.type).toBe('desktop');
    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('Windows');
  });

  it('parses Safari on iPhone as mobile', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(result.type).toBe('mobile');
    expect(result.browser).toBe('Mobile Safari');
    expect(result.os).toBe('iOS');
  });

  it('parses Firefox on Linux as desktop', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    );
    expect(result.type).toBe('desktop');
    expect(result.browser).toBe('Firefox');
    expect(result.os).toBe('Linux');
  });

  it('parses Safari on macOS as desktop', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    expect(result.type).toBe('desktop');
    expect(result.browser).toBe('Safari');
    expect(result.os).toBe('macOS');
  });

  it('returns Unknown for empty string', () => {
    const result = parseUserAgent('');
    expect(result.type).toBe('desktop');
    expect(result.browser).toBe('Unknown');
    expect(result.os).toBe('Unknown');
  });

  it('does not crash on unusual UA strings', () => {
    const result = parseUserAgent('SomeRandomClient/1.0');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('browser');
    expect(result).toHaveProperty('os');
  });
});
