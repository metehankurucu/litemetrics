import type { BotDetectedInfo } from '@litemetrics/node';

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

export interface AccessLogInput {
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  /** Pre-computed auth marker, e.g. "[admin]". Empty when unauthenticated. */
  auth: string;
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
  return parts.join(' ');
}
