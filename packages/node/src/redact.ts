/**
 * A database driver quotes the connection string back in its error messages, and the
 * connection string carries the password. Anything that carries a driver message out
 * of the collector (a callback, a log line) runs it through here first.
 *
 * Redaction happens before any truncation: a message sliced to a length budget can
 * lose the `@` that marks the end of the credentials, and a half a DSN with the
 * password still in it reads as ordinary text to every later pass.
 */
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

/** Replace `scheme://user:pass@` with `scheme://***@`. Leaves everything else alone. */
export function redactUrlCredentials(text: string): string {
  return text.replace(URL_CREDENTIALS, '$1***@');
}
