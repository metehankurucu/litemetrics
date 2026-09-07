/**
 * A database driver quotes the connection string back in its error messages, and the
 * connection string carries the password. Anything that carries a driver message out
 * of the collector (a callback, a log line) runs it through here first.
 *
 * Redaction happens before any truncation: a message sliced to a length budget can
 * lose the `@` that marks the end of the credentials, and a half a DSN with the
 * password still in it reads as ordinary text to every later pass.
 */
// Start at a fixed delimiter, then scan each authority once. An unbounded scheme
// prefix in the regex would backtrack quadratically on long colon-free messages.
// Path, query and fragment delimiters end the authority, so their @ stays intact.
const URL_AUTHORITY = /:\/\/[^/\s?#]*/g;
const SCHEME_CHARACTER = /[a-z0-9+.-]/i;
const SCHEME_START = /[a-z]/i;

/** Replace `scheme://user:pass@` with `scheme://***@`. Leaves everything else alone. */
export function redactUrlCredentials(text: string): string {
  return text.replace(URL_AUTHORITY, (authority, offset: number) => {
    // These preceding scheme runs cannot overlap, keeping the total scan linear.
    let schemeStart = offset;
    while (schemeStart > 0 && SCHEME_CHARACTER.test(text[schemeStart - 1]!)) schemeStart--;
    if (schemeStart === offset || !SCHEME_START.test(text[schemeStart]!)) return authority;

    const at = authority.lastIndexOf('@');
    return at < 3 ? authority : `://***@${authority.slice(at + 1)}`;
  });
}
