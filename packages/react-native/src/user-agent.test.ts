import { describe, it, expect } from 'vitest';
import { isbot } from 'isbot';
import { SDK_NAME, SDK_VERSION, buildUserAgent } from './user-agent';
import pkg from '../package.json' with { type: 'json' };

describe('buildUserAgent', () => {
  it('identifies the SDK and the platform', () => {
    expect(buildUserAgent('ios')).toBe(`litemetrics-react-native/${SDK_VERSION} (ios)`);
    expect(buildUserAgent('android')).toBe(`litemetrics-react-native/${SDK_VERSION} (android)`);
  });

  it('falls back to a named platform rather than emitting an empty parenthesis', () => {
    expect(buildUserAgent(undefined)).toBe(`litemetrics-react-native/${SDK_VERSION} (unknown)`);
  });

  // The whole point of sending a User-Agent at all. isbot does not just match a list
  // of crawler names: it also flags any bare `name/version` token with no
  // parenthetical, which is why `okhttp/4.12.0` was being dropped in the first place.
  // A carelessly shaped SDK UA lands in exactly the same trap - `litemetrics-node/0.4.0
  // (server)` is flagged too - so this cannot be reasoned about, only tested.
  it.each(['ios', 'android'] as const)('is not classified as a bot on %s', (platform) => {
    expect(isbot(buildUserAgent(platform))).toBe(false);
  });

  it('would fail if the parenthetical were dropped (guards the shape, not the string)', () => {
    expect(isbot(`${SDK_NAME}/${SDK_VERSION}`)).toBe(true);
  });
});

describe('SDK_VERSION', () => {
  // It read 0.2.2 while the package was at 0.4.0, so every event carried a wrong
  // sdkVersion. It is now read from package.json; this pins that wiring so nobody
  // reintroduces a hand-kept constant.
  it('is the package.json version', () => {
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
