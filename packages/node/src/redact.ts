/**
 * A database driver quotes the connection string back in its error messages, and the
 * connection string carries the password. Anything that carries a driver message out
 * of the collector (a callback, a log line) runs it through here first.
 *
 * Redaction happens before any truncation: a message sliced to a length budget can
 * lose the `@` that marks the end of the credentials, and a half a DSN with the
 * password still in it reads as ordinary text to every later pass.
 */
// Both quantifiers are bounded on purpose: the unbounded form backtracks quadratically on a
// long colon-free run (200 KB of driver text measured at 16 s), and this runs on the raw
// message before any truncation. Scheme names top out well under 32 chars; RFC 3986 userinfo
// in a real DSN is far shorter than 512.
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]{0,31}:\/\/)[^/\s@]{1,512}@/gi;

/** Replace `scheme://user:pass@` with `scheme://***@`. Leaves everything else alone. */
export function redactUrlCredentials(text: string): string {
  return text.replace(URL_CREDENTIALS, '$1***@');
}
