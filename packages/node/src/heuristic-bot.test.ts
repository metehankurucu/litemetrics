import { describe, it, expect } from 'vitest';
import { isHeuristicBot } from './heuristic-bot';

describe('isHeuristicBot', () => {
  it('flags scrubbed Mozilla-only UA with no headers (the live nailmirror bot signature)', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0 (compatible)',
        acceptLanguage: undefined,
        referer: undefined,
      }),
    ).toBe(true);
  });

  it('flags totally generic UA with no headers', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: '',
        referer: '',
      }),
    ).toBe(true);
  });

  it('does NOT flag real Chrome with no Referer (direct visit) when Accept-Language present', () => {
    expect(
      isHeuristicBot({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        referer: undefined,
      }),
    ).toBe(false);
  });

  it('does NOT flag privacy browser with localized Accept-Language and missing Referer', () => {
    expect(
      isHeuristicBot({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0',
        acceptLanguage: 'tr-TR,tr;q=0.9',
        referer: undefined,
      }),
    ).toBe(false);
  });

  it('does NOT flag scrubbed UA when Accept-Language is present (real privacy user)', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: 'en-US,en;q=0.9',
        referer: undefined,
      }),
    ).toBe(false);
  });

  it('does NOT flag scrubbed UA when Referer is present', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: undefined,
        referer: 'https://google.com/',
      }),
    ).toBe(false);
  });

  it('handles empty UA gracefully (returns true - but signature filter catches it first)', () => {
    expect(
      isHeuristicBot({
        userAgent: '',
        acceptLanguage: undefined,
        referer: undefined,
      }),
    ).toBe(true);
  });

  it('treats whitespace-only Accept-Language as missing (still flags scrubbed UA)', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: '   ',
        referer: undefined,
      }),
    ).toBe(true);
  });

  it('treats whitespace-only Referer as missing', () => {
    // UA + Referer are both whitespace-effectively-empty + lang missing → still scrubbed.
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: undefined,
        referer: '\t  \n',
      }),
    ).toBe(true);
  });

  it('does NOT flag when Accept-Language has at least one non-whitespace char', () => {
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: ' x ',
        referer: undefined,
      }),
    ).toBe(false);
  });

  it('flags the live observed bare "Mozilla/5.0" UA when other signals also missing', () => {
    // Regression guard for the production bot signature noted in the source comment.
    expect(
      isHeuristicBot({
        userAgent: 'Mozilla/5.0',
        acceptLanguage: undefined,
        referer: undefined,
      }),
    ).toBe(true);
  });
});
