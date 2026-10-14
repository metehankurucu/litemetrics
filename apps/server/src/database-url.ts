/**
 * What the startup banner says about the database: `host[:port][/database]`.
 *
 * The connection string carries the password, in the userinfo or as a `password=`
 * query parameter, and the banner lands in the deploy logs. So the output is built
 * from the host, port and path alone rather than by deleting what looks secret: a
 * credential that is never copied in cannot leak under a parameter name nobody thought
 * of. Anything that cannot be read that way unambiguously gets a placeholder and is
 * never echoed, because then nothing marks which part of it is the password.
 *
 * Lives outside `index.ts` because that module boots a listening server the moment it
 * is imported, so nothing in it can be exercised from a test.
 */
export function describeDatabaseUrl(url: string | null | undefined): string {
  const raw = url?.trim();
  if (!raw) return '<not set>';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Includes a multi-host mongodb:// list with ports (`h1:27017,h2:27017`), which the
    // URL parser does not take. Without ports the list parses and prints as `h1,h2/db`.
    return '<unparseable url>';
  }

  // An unencoded `/`, `?` or `#` inside the password ends the authority early: the
  // username then parses as the host, the start of the password as the port, and the
  // `@` that closed the credentials is left behind after the authority. An `@` there
  // means the "host" may be the credentials, so none of it is shown.
  //
  // It is looked for in the input, not in `pathname`: the parser folds `..` segments
  // (`%2e%2e` too), so `/s3cret@db.internal/..` comes back as `/` with the `@` gone.
  // Tab and newline go first because the parser drops them before it parses. `\` ends
  // the authority here for every scheme, though the parser does that for http(s) only,
  // so a postgres password with a `\` in it gets the placeholder too: less detail,
  // never a guess.
  const afterScheme = raw.replace(/[\t\n\r]/g, '').replace(/^[^:]*:[/\\]*/, '');
  const authorityEnd = afterScheme.search(/[/\\?#]/);
  const strayAt = authorityEnd !== -1 && afterScheme.includes('@', authorityEnd);
  if (!parsed.host || strayAt) return '<unparseable url>';

  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.host}${path}`;
}
