import { describe, expect, it } from 'vitest';
import { normalizeReferrer } from '../normalize-referrer';
import { normalizedReferrerExpr } from './clickhouse';

/**
 * The query-time normalizers (ClickHouse SQL chain and MongoDB
 * $regexFind pipeline) must agree with the TS write-time normalizer
 * for every input class, otherwise old raw rows and new pre-normalized
 * rows would group under different keys.
 *
 * Both query patterns use only RE2-/PCRE-compatible features that JS regex
 * implements identically (anchors, ASCII char classes, simple alternation,
 * no lookarounds, no backrefs). The simulators below therefore faithfully
 * model SQL/Mongo behavior for *this specific pattern set*. Anyone editing
 * the patterns must keep them within that subset (or replace the simulator
 * with a real-engine integration test).
 */
function simulateClickHouseExpr(referrer: string | null | undefined): string | undefined {
  if (referrer === null || referrer === undefined) return undefined;
  const lower = referrer.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return lower;
  const noProto = lower.replace(/^https?:\/\//, '');
  const noPrefix = noProto.replace(/^(www\.|m\.)/, '');
  const noPath = noPrefix.replace(/\/.*$/, '');
  return noPath.replace(/:[0-9]+$/, '');
}

function simulateMongoExpr(referrer: string | null | undefined): string | undefined {
  if (referrer === null || referrer === undefined) return undefined;
  const lower = referrer.toLowerCase();
  const match = lower.match(/^https?:\/\/(?:www\.|m\.)?([^:/]+)/);
  return match ? match[1] : lower;
}

const corpus: { input: string; expected: string }[] = [
  // Trailing slash duplicates
  { input: 'https://www.tiktok.com/', expected: 'tiktok.com' },
  { input: 'https://www.tiktok.com', expected: 'tiktok.com' },
  // Protocol duplicates
  { input: 'http://instagram.com/', expected: 'instagram.com' },
  { input: 'https://instagram.com/', expected: 'instagram.com' },
  // m. subdomain
  { input: 'http://m.facebook.com', expected: 'facebook.com' },
  // Search engines
  { input: 'https://www.google.com/', expected: 'google.com' },
  { input: 'https://www.bing.com/', expected: 'bing.com' },
  { input: 'https://search.yahoo.com/', expected: 'search.yahoo.com' },
  { input: 'https://duckduckgo.com/', expected: 'duckduckgo.com' },
  // Path stripped
  { input: 'https://www.google.com/search?q=foo', expected: 'google.com' },
  // Casing folded
  { input: 'HTTPS://WWW.Google.COM/', expected: 'google.com' },
  // Port stripped (matches URL.hostname behavior)
  { input: 'https://example.com:8080/', expected: 'example.com' },
  { input: 'http://www.example.com:443/path', expected: 'example.com' },
  // Protocol-less referrers (parse fail in TS, no http guard in CH/Mongo) — pass through
  { input: 'tiktok.com', expected: 'tiktok.com' },
  // mailto / non-http schemes preserved as-is (lowercased)
  { input: 'mailto:hello@example.com', expected: 'mailto:hello@example.com' },
  {
    input: 'android-app://com.google.android.googlequicksearchbox/',
    expected: 'android-app://com.google.android.googlequicksearchbox/',
  },
];

describe('referrer normalization pattern equivalence', () => {
  it.each(corpus)('TS normalizer maps $input to $expected', ({ input, expected }) => {
    expect(normalizeReferrer(input)).toBe(expected);
  });

  it.each(corpus)('ClickHouse SQL maps $input to $expected', ({ input, expected }) => {
    expect(simulateClickHouseExpr(input)).toBe(expected);
  });

  it.each(corpus)('MongoDB pipeline maps $input to $expected', ({ input, expected }) => {
    expect(simulateMongoExpr(input)).toBe(expected);
  });

  it.each(corpus)('all three implementations agree on $input', ({ input }) => {
    const ts = normalizeReferrer(input);
    const ch = simulateClickHouseExpr(input);
    const mongo = simulateMongoExpr(input);
    expect({ ts, ch, mongo }).toEqual({ ts, ch: ts, mongo: ts });
  });

  it.each(corpus)('query-time normalization is idempotent on already-normalized $input', ({ input }) => {
    // Old raw row + new pre-normalized row must collapse to the same key.
    const preNormalized = normalizeReferrer(input)!;
    expect(simulateClickHouseExpr(preNormalized)).toBe(preNormalized);
    expect(simulateMongoExpr(preNormalized)).toBe(preNormalized);
    // Double-applying TS normalizer is also stable.
    expect(normalizeReferrer(preNormalized)).toBe(preNormalized);
  });

  it('ClickHouse SQL fragment references the referrer column and key patterns', () => {
    const sql = normalizedReferrerExpr();
    expect(sql).toContain('lower(referrer)');
    expect(sql).toContain('^https?://');
    expect(sql).toContain('^(www\\\\.|m\\\\.)');
    expect(sql).toContain(':[0-9]+$');
  });
});
