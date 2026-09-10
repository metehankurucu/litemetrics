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
 * keeps it off the signature layer's list.
 *
 * That is Layer 1 only, and it is not enough on its own: this UA resolves to no
 * browser and no engine, and the SDK sends no `Accept-Language` or `Referer`, so a
 * site that is not typed `app` still trips the server's heuristic layer. Typing the
 * site `app` is what actually exempts the traffic - see packages/node's README.
 *
 * The parenthetical is load-bearing, not decoration. isbot flags any bare
 * `name/version` token that carries no parenthetical - that rule, not a crawler
 * blocklist, is what caught `okhttp/4.12.0`. `user-agent.test.ts` pins both halves.
 */
export function buildUserAgent(platform: string | undefined): string {
  return `${SDK_NAME}/${SDK_VERSION} (${platform || 'unknown'})`;
}
