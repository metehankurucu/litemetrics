import { version as SDK_VERSION } from '../package.json';

export const SDK_NAME = 'litemetrics-react-native';
// Read from package.json so a version bump cannot leave the User-Agent and the
// sdkVersion field behind - CI runs typecheck + build only, so a hand-kept constant
// would drift again the first time nobody ran the tests before publishing.
export { SDK_VERSION };

/**
 * The User-Agent the SDK sends on every collect request.
 *
 * React Native's fetch sets no User-Agent of its own, so the platform fills one in:
 * on Android that is OkHttp's `okhttp/<version>`, which the server's bot filter
 * matches, silently dropping the event. Sending our own identifies the traffic and
 * stops it landing in a filter meant for browsers.
 *
 * The parenthetical is load-bearing, not decoration. isbot flags any bare
 * `name/version` token that carries no parenthetical - that rule, not a crawler
 * blocklist, is what caught `okhttp/4.12.0`. `user-agent.test.ts` pins both halves.
 */
export function buildUserAgent(platform: string | undefined): string {
  return `${SDK_NAME}/${SDK_VERSION} (${platform || 'unknown'})`;
}
