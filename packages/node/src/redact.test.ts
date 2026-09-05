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

  it('stays linear on a long colon-free run (bounded quantifiers)', () => {
    const run = 'a'.repeat(200_000);
    const started = performance.now();
    expect(redactUrlCredentials(run)).toBe(run);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
