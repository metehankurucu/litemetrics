import type { BotDetectedInfo, CollectErrorInfo, SiteTypeMismatchInfo } from '@litemetrics/node';

// Everything formatted here comes from the request: the User-Agent header, the
// X-Forwarded-For chain, the siteId inside the JSON body, the URL. A newline in any
// of them would let one request write its own log entries, so nothing reaches a log
// line without passing through a sanitizer first.

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Render a User-Agent for a log line: single-line, quote-safe, length-capped.
 * Returns "-" when there is nothing to show, so an empty field never looks like a
 * formatting bug.
 */
export function sanitizeUserAgent(ua: string | undefined, maxLength = 200): string {
  if (!ua) return '-';
  const clean = ua.replace(CONTROL_CHARS, ' ').replace(/"/g, "'").replace(/\s+/g, ' ').trim();
  if (!clean) return '-';
  const chars = Array.from(clean);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}...` : clean;
}

/**
 * Render an identifier (site id, IP, method, URL) for a log line. Tokens carry no
 * whitespace, so anything outside printable ASCII is dropped rather than replaced -
 * that keeps `key=value` parseable no matter what was sent.
 */
export function sanitizeToken(value: string | undefined, maxLength = 64, truncationMarker = ''): string {
  if (!value) return '-';
  const clean = value.replace(/[^\x21-\x7e]/g, '');
  if (!clean) return '-';
  return clean.length > maxLength ? clean.slice(0, maxLength) + truncationMarker : clean;
}

/**
 * Audit line for a bot-filter hit. `reason` and `ua` are what make a drop
 * diagnosable: `layer=signature` alone cannot tell a crawler apart from an SDK that
 * forgot to send a User-Agent.
 */
export function formatBotFilterLine(info: BotDetectedInfo): string {
  return [
    '[bot-filter]',
    info.action,
    `layer=${info.layer}`,
    `reason=${info.reason}`,
    `mode=${info.mode}`,
    `site=${sanitizeToken(info.siteId)}`,
    `ip=${sanitizeToken(info.ip, 45)}`,
    `ua="${sanitizeUserAgent(info.userAgent)}"`,
  ].join(' ');
}

/**
 * One-per-site warning that app SDK events are landing on a site not typed `app`.
 * `platform` is whatever the request body declared, so it goes through the token
 * sanitizer like every other request-derived field; the mode decides what the line
 * can honestly claim (under `off` nothing is being filtered).
 */
export function formatSiteTypeMismatchLine(info: SiteTypeMismatchInfo): string {
  const consequence = info.mode === 'off'
    ? 'not filtered (mode=off) but shown as a web site'
    : 'app SDK events on a non-app site are still filtered as browser traffic';
  return [
    '[site-type-mismatch]',
    `site=${sanitizeToken(info.siteId)}`,
    `type=${info.siteType ?? 'unset'}`,
    `platform=${sanitizeToken(info.platform, 32)}`,
    `mode=${info.mode}`,
    '-',
    consequence,
  ].join(' ');
}

/**
 * A driver error message can quote the connection string back, and the connection
 * string carries the password. Strip the userinfo before anything else looks at it.
 */
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

/**
 * Detail line for a /api/collect 500. The counters live in the minute summary; this
 * says which stage failed and with what, which is the part that decides whether an
 * operator is looking at a database outage or at one broken caller. Everything except
 * the stage is either driver text or request-derived, so it is sanitized: the class
 * and site as tokens, the message as a quoted free-text field (spaces kept, control
 * characters and quotes neutralized, length capped).
 */
export function formatCollectErrorLine(info: CollectErrorInfo): string {
  const redacted = (info.message ?? '').replace(URL_CREDENTIALS, '$1***@');
  return [
    '[collect-error]',
    `stage=${sanitizeToken(info.stage, 16)}`,
    `class=${sanitizeToken(info.errorClass, 40)}`,
    `site=${sanitizeToken(info.siteId)}`,
    `events=${info.eventCount ?? '-'}`,
    `msg="${sanitizeUserAgent(redacted, 160)}"`,
  ].join(' ');
}

export interface AccessLogInput {
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  /** Pre-computed auth marker, e.g. "[admin]". Empty when unauthenticated. */
  auth: string;
  /**
   * True when the client gave up before the answer went out. The status code on such
   * a line is what the pipeline had set, not what was delivered, so the line is marked
   * rather than left to read as a served request.
   */
  aborted?: boolean;
}

/** Per-request access line for everything except /api/collect. */
export function formatAccessLine(input: AccessLogInput): string {
  const time = new Date(input.timestamp).toISOString().slice(11, 19);
  const parts = [
    time,
    sanitizeToken(input.method, 10),
    // Marked rather than silently cut: a truncated path that still looks like a
    // path is worse than no path, because it reads as a request that never happened.
    sanitizeToken(input.url, 200, '...'),
    String(input.statusCode),
    `${Math.round(input.durationMs)}ms`,
  ];
  if (input.auth) parts.push(input.auth);
  if (input.aborted) parts.push('aborted');
  return parts.join(' ');
}
