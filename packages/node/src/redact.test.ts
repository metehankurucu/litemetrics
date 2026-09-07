import { describe, it, expect } from 'vitest';
import { redactUrlCredentials } from './redact';

describe('redactUrlCredentials', () => {
  it('replaces the userinfo of a postgres DSN', () => {
    expect(
      redactUrlCredentials('connect ECONNREFUSED postgres://lm_user:s3cr3t-pw@db.internal:5432/lm'),
    ).toBe('connect ECONNREFUSED postgres://***@db.internal:5432/lm');
  });

  it('replaces a user-only userinfo too', () => {
    expect(redactUrlCredentials('clickhouse://admin@ch.internal:8123')).toBe(
      'clickhouse://***@ch.internal:8123',
    );
  });

  it('redacts every occurrence in one message', () => {
    const out = redactUrlCredentials(
      'failover from mongodb://a:1@one to mongodb://b:2@two',
    );
    expect(out).toBe('failover from mongodb://***@one to mongodb://***@two');
  });

  it('leaves a credential-free URL untouched', () => {
    expect(redactUrlCredentials('connect ECONNREFUSED http://127.0.0.1:8123/')).toBe(
      'connect ECONNREFUSED http://127.0.0.1:8123/',
    );
  });

  it('does not mangle an email address that is not part of a URL', () => {
    expect(redactUrlCredentials('unknown user ops@example.com')).toBe(
      'unknown user ops@example.com',
    );
  });

  it('returns a message with no URL in it unchanged', () => {
    expect(redactUrlCredentials('Code: 999. DB::Exception: table is read only')).toBe(
      'Code: 999. DB::Exception: table is read only',
    );
  });

  it('leaves an @ inside a URL path alone', () => {
    expect(redactUrlCredentials('see https://example.com/users/a@b for details')).toBe(
      'see https://example.com/users/a@b for details',
    );
  });

  it('does not swallow a URL followed by a bare email', () => {
    expect(
      redactUrlCredentials('read https://docs.example.com and mail admin@example.com'),
    ).toBe('read https://docs.example.com and mail admin@example.com');
  });

  it.each([512, 513, 10_000])('redacts userinfo of length %i without a cutoff', (length) => {
    const userinfo = `user:${'p'.repeat(length - 5)}`;
    expect(redactUrlCredentials(`postgres://${userinfo}@db.internal/lm`)).toBe(
      'postgres://***@db.internal/lm',
    );
  });

  it('supports long valid scheme names', () => {
    const scheme = `custom${'x'.repeat(100)}`;
    expect(redactUrlCredentials(`${scheme}://user:secret@host/path`)).toBe(
      `${scheme}://***@host/path`,
    );
  });

  it('redacts through the final @ in an authority', () => {
    expect(redactUrlCredentials('postgres://user:pass@word@db.internal/lm')).toBe(
      'postgres://***@db.internal/lm',
    );
  });

  it.each(['?email=a@b', '#a@b'])('leaves an @ in %s outside the authority untouched', (suffix) => {
    const url = `https://example.com${suffix}`;
    expect(redactUrlCredentials(url)).toBe(url);
    expect(redactUrlCredentials(`https://user:secret@example.com${suffix}`)).toBe(
      `https://***@example.com${suffix}`,
    );
  });

  it('leaves a long credential-free authority untouched', () => {
    const url = `https://${'a'.repeat(200_000)}/path`;
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it('leaves already redacted credentials unchanged', () => {
    const message = 'postgres://***@db.internal/lm';
    expect(redactUrlCredentials(message)).toBe(message);
  });

  it('stays linear on a long colon-free run', () => {
    const run = 'a'.repeat(200_000);
    const started = performance.now();
    expect(redactUrlCredentials(run)).toBe(run);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
