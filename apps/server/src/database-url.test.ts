import { describe, it, expect } from 'vitest';
import { describeDatabaseUrl } from './database-url';

// The startup banner prints this, and the banner lands in the production deploy logs.
// Each case pins the exact output and, separately, that no piece of the credentials
// made it in, so a later change to the expected string cannot quietly let one back.
function expectNoneOf(out: string, ...fragments: string[]) {
  for (const fragment of fragments) expect(out).not.toContain(fragment);
}

describe('describeDatabaseUrl', () => {
  it('keeps the host, port and database of a postgres URL and drops the user and password', () => {
    const out = describeDatabaseUrl('postgres://lm_user:s3cret@db.internal:5432/litemetrics');
    expect(out).toBe('db.internal:5432/litemetrics');
    expectNoneOf(out, 'lm_user', 's3cret', '@');
  });

  it('drops a password passed as a query parameter', () => {
    const out = describeDatabaseUrl(
      'postgresql://db.internal:5432/litemetrics?user=lm_user&password=s3cret&sslmode=require',
    );
    expect(out).toBe('db.internal:5432/litemetrics');
    expectNoneOf(out, 'lm_user', 's3cret', 'password', '?');
  });

  it('keeps the cluster host and database of a mongodb+srv URL', () => {
    const out = describeDatabaseUrl(
      'mongodb+srv://lm_user:s3cret@cluster0.example.net/litemetrics?retryWrites=true&w=majority',
    );
    expect(out).toBe('cluster0.example.net/litemetrics');
    expectNoneOf(out, 'lm_user', 's3cret', 'retryWrites');
  });

  it.each([
    ['http://lm_user:s3cret@ch.internal:8123/litemetrics', 'ch.internal:8123/litemetrics'],
    ['https://lm_user:s3cret@ch.example.com:8443', 'ch.example.com:8443'],
  ])('drops the credentials of the ClickHouse URL %s', (url, expected) => {
    const out = describeDatabaseUrl(url);
    expect(out).toBe(expected);
    expectNoneOf(out, 'lm_user', 's3cret');
  });

  // Nothing marks which part of these is the password, so none of it is printed.
  it.each([
    ['plain text', 'lm_user s3cret db.internal:5432'],
    ['a URL with a non-numeric port', 'postgres://lm_user:s3cret@db.internal:port/litemetrics'],
    ['a scheme-like prefix with no host', 'lm:s3cret'],
    ['a multi-host mongodb URL', 'mongodb://lm_user:s3cret@db.internal:27017,db2.internal:27017/litemetrics'],
  ])('does not echo %s', (_label, raw) => {
    const out = describeDatabaseUrl(raw);
    expect(out).toBe('<unparseable url>');
    expectNoneOf(out, 'lm_user', 's3cret', 'db.internal');
  });

  // An unencoded `/`, `?` or `#` (or `\` in an http URL) inside the password ends the
  // authority early. The URL parser then reads the username as the host and the start
  // of the password as the port, so the "host" it hands back is the credentials.
  it.each([
    'postgres://lm_user:12/s3cret@db.internal:5432/litemetrics',
    'postgres://lm_user:12?s3cret@db.internal:5432/litemetrics',
    'postgres://lm_user:12#s3cret@db.internal:5432/litemetrics',
    'http://lm_user:12\\s3cret@ch.internal:8123/litemetrics',
    // The parser folds `..` segments, which can take the left-behind `@` out of the path.
    'postgres://lm_user:12/s3cret@db.internal:5432/../litemetrics',
    'postgres://lm_user:12/s3cret@db.internal:5432/%2e%2e/litemetrics',
  ])('does not mistake the credentials for the host in %s', (raw) => {
    const out = describeDatabaseUrl(raw);
    expect(out).toBe('<unparseable url>');
    expectNoneOf(out, 'lm_user', '12', 's3cret');
  });

  it.each([undefined, null, '', '   '])('reports %j as not set', (raw) => {
    expect(describeDatabaseUrl(raw)).toBe('<not set>');
  });
});
