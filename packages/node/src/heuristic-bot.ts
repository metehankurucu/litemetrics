import { UAParser } from 'ua-parser-js';

const parser = new UAParser();

export interface HeuristicBotInput {
  userAgent: string;
  acceptLanguage: string | undefined;
  referer: string | undefined;
}

/**
 * Layer 2 bot filter - heuristic for scrubbed/forged UAs that bypass signature matching.
 *
 * A request is flagged when ALL of the following are true:
 *   - ua-parser cannot identify a browser (`browser.name` is undefined)
 *   - ua-parser cannot identify an engine (`engine.name` is undefined)
 *   - `Accept-Language` header is absent or empty
 *   - `Referer` header is absent or empty
 *
 * All four signals being empty is extremely rare for real browsers - even Tor and
 * privacy browsers send Accept-Language. This combination is the live signature of
 * scrubbed-UA bots observed on production landing pages (May 2026).
 */
export function isHeuristicBot(input: HeuristicBotInput): boolean {
  if (!input.userAgent) return true;

  parser.setUA(input.userAgent);
  const result = parser.getResult();
  const hasBrowser = Boolean(result.browser?.name);
  const hasEngine = Boolean(result.engine?.name);
  const hasLang = Boolean(input.acceptLanguage && input.acceptLanguage.trim());
  const hasReferer = Boolean(input.referer && input.referer.trim());

  return !hasBrowser && !hasEngine && !hasLang && !hasReferer;
}
