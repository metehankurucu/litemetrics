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
    // Includes a multi-host mongodb:// list, which the URL parser does not take.
    return '<unparseable url>';
  }

  // An unencoded `/`, `?` or `#` inside the password ends the authority early: the
  // username then parses as the host, the start of the password as the port, and the
  // `@` that closed the credentials is left behind in the path, query or fragment. An
  // `@` there means the "host" may be the credentials, so none of it is shown.
  const rest = parsed.pathname + parsed.search + parsed.hash;
  if (!parsed.host || rest.includes('@')) return '<unparseable url>';

  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.host}${path}`;
}
