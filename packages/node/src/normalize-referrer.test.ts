import { describe, expect, it } from 'vitest';
import { normalizeReferrer } from './normalize-referrer';

describe('normalizeReferrer', () => {
  it('strips trailing slash and protocol', () => {
    expect(normalizeReferrer('https://www.tiktok.com/')).toBe('tiktok.com');
    expect(normalizeReferrer('https://www.tiktok.com')).toBe('tiktok.com');
  });

  it('merges http and https', () => {
    expect(normalizeReferrer('http://instagram.com/')).toBe('instagram.com');
    expect(normalizeReferrer('https://instagram.com/')).toBe('instagram.com');
  });

  it('strips m. prefix', () => {
    expect(normalizeReferrer('http://m.facebook.com')).toBe('facebook.com');
  });

  it('preserves non-www subdomains', () => {
    expect(normalizeReferrer('https://search.yahoo.com/')).toBe('search.yahoo.com');
  });

  it('keeps non-http schemes lowercased', () => {
    expect(normalizeReferrer('android-app://com.google.android.googlequicksearchbox/')).toBe(
      'android-app://com.google.android.googlequicksearchbox/',
    );
  });

  it('strips path from http URLs', () => {
    expect(normalizeReferrer('https://www.google.com/search?q=foo')).toBe('google.com');
  });

  it('is idempotent on already-normalized values', () => {
    expect(normalizeReferrer('tiktok.com')).toBe('tiktok.com');
    const once = normalizeReferrer('https://www.tiktok.com/');
    expect(normalizeReferrer(once)).toBe('tiktok.com');
  });

  it('returns undefined for empty/nullish', () => {
    expect(normalizeReferrer(undefined)).toBeUndefined();
    expect(normalizeReferrer(null)).toBeUndefined();
    expect(normalizeReferrer('')).toBeUndefined();
    expect(normalizeReferrer('   ')).toBeUndefined();
  });
});
