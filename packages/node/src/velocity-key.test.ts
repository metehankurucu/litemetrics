import { describe, it, expect } from 'vitest';
import { velocityKey, MAX_VISITOR_KEY_LEN } from './velocity-key';

describe('velocityKey', () => {
  // R11 - the memory property, as an assertion rather than a comment. Both halves of the
  // pair arrive in an unvalidated request body, and a Map key is retained for the life of
  // its entry, so what bounds layer 4's memory is the length of THIS string. A 1 MB site
  // id and a 1-byte one have to produce the same 64 characters.
  it('returns a fixed-length key whatever the input size', () => {
    const small = velocityKey('site_abc123', 'v1');
    const huge = velocityKey('site_'.padEnd(1_000_000, 'x'), 'v'.repeat(MAX_VISITOR_KEY_LEN));

    expect(small).toHaveLength(64);
    expect(huge).toHaveLength(64);
    expect(small).toMatch(/^[0-9a-f]{64}$/);
    expect(huge).toMatch(/^[0-9a-f]{64}$/);
  });

  // R11 - hashing, not truncating: two different pairs must never collapse onto one
  // window, or a flood could ride in on a real visitor's budget by sharing a prefix.
  it('gives the same visitor id a different key on a different site', () => {
    expect(velocityKey('site_aaa', 'v1')).not.toBe(velocityKey('site_bbb', 'v1'));
  });

  it('gives two visitors on one site different keys', () => {
    expect(velocityKey('site_aaa', 'v1')).not.toBe(velocityKey('site_aaa', 'v2'));
  });

  // R11 - the halves are length-prefixed, so a visitor id carrying the separator cannot
  // impersonate another site's window (`site_a:b` + `c` vs `site_a` + `b:c`).
  it('keeps the two halves apart when a visitor id contains the separator', () => {
    expect(velocityKey('site_a:b', 'c')).not.toBe(velocityKey('site_a', 'b:c'));
  });

  // A window has to be findable again on the next request, so the key is a pure function
  // of the pair and nothing else.
  it('is stable across calls for the same pair', () => {
    expect(velocityKey('site_abc123', 'v_bejudge')).toBe(velocityKey('site_abc123', 'v_bejudge'));
  });
});
