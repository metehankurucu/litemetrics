import { describe, it, expect } from 'vitest';
import { isBot, classifyUserAgent } from './botfilter';

describe('isBot', () => {
  describe('detects bots', () => {
    it.each([
      ['', 'empty string'],
      ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Googlebot'],
      ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Bingbot'],
      ['curl/7.68.0', 'curl'],
      ['Wget/1.21', 'wget'],
      ['PostmanRuntime/7.32.3', 'PostmanRuntime'],
      ['Slackbot-LinkExpanding 1.0', 'Slackbot'],
      ['facebookexternalhit/1.1', 'Facebook crawler'],
      ['Twitterbot/1.0', 'Twitterbot'],
      ['Mozilla/5.0 HeadlessChrome/120.0.0.0', 'HeadlessChrome'],
      ['python-requests/2.31.0', 'python-requests'],
      ['axios/1.6.0', 'axios'],
      ['UptimeRobot/2.0', 'UptimeRobot'],
      ['LinkedInBot/1.0', 'LinkedInBot'],
      ['Discordbot/2.0', 'Discordbot'],
      ['WhatsApp/2.23.20.78', 'WhatsApp'],
      // 2026 AI training / scraper bots that must be caught
      ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot', 'GPTBot'],
      ['Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ClaudeBot'],
      ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'PerplexityBot'],
      ['Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)', 'ChatGPT-User'],
      ['Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)', 'Bytespider'],
      ['Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)', 'Amazonbot'],
      ['Mozilla/5.0 (compatible; Meta-ExternalAgent/1.1; +https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'Meta-ExternalAgent'],
      ['Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)', 'CCBot'],
      ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'AhrefsBot'],
      ['Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)', 'SemrushBot'],
      ['Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse', 'Chrome-Lighthouse'],
    ])('returns true for %s (%s)', (ua) => {
      expect(isBot(ua)).toBe(true);
    });

    // Regression pin: the heuristic-bot layer is gated to strict/shadow modes
    // precisely because isbot already classifies bare `Mozilla/5.0` (and the
    // `Mozilla/5.0 (compatible)` scrubbed variant) as a signature bot in
    // standard mode. If isbot ever weakens here, the L2 heuristic must be
    // re-evaluated and a "drops heuristic in standard mode" test reinstated.
    it('classifies bare Mozilla/5.0 as a signature bot (gates L2 heuristic behavior)', () => {
      expect(isBot('Mozilla/5.0')).toBe(true);
      expect(isBot('Mozilla/5.0 (compatible)')).toBe(true);
    });
  });

  describe('allows real browsers', () => {
    it.each([
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Chrome Windows'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Safari macOS'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari iOS'],
      ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36', 'Chrome Android'],
    ])('returns false for %s (%s)', (ua) => {
      expect(isBot(ua)).toBe(false);
    });
  });
});

describe('classifyUserAgent', () => {
  it('reports a missing UA as empty-ua, not as a signature match', () => {
    expect(classifyUserAgent('')).toBe('empty-ua');
  });

  it('reports an isbot list match as ua-signature', () => {
    expect(classifyUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('ua-signature');
    expect(classifyUserAgent('curl/7.68.0')).toBe('ua-signature');
  });

  it('returns null for real browsers', () => {
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBeNull();
  });

  // The reason this whole field exists: on Android, React Native's fetch goes through
  // OkHttp, which fills in `User-Agent: okhttp/<version>` when the caller sets none.
  // isbot matches it, so app traffic was being dropped as a signature bot with no way
  // to tell it apart from a real crawler in the logs.
  it.each(['okhttp/3.14.9', 'okhttp/4.9.2', 'okhttp/4.12.0', 'okhttp/5.0.0-alpha.14'])(
    'classifies the OkHttp default UA %s as ua-signature',
    (ua) => {
      expect(classifyUserAgent(ua)).toBe('ua-signature');
    },
  );

  // R2: adding the reason must not move the boolean gate for any input, or every
  // existing deployment silently changes what it drops.
  it('agrees with isBot on every corpus entry', () => {
    const corpus = [
      '',
      'curl/7.68.0',
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'okhttp/4.12.0',
      'Mozilla/5.0',
      'Mozilla/5.0 (compatible)',
      ' ',
      'OK NOK/1.0 CFNetwork/1498.700.2 Darwin/23.6.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
    ];
    for (const ua of corpus) {
      expect(classifyUserAgent(ua) !== null, `mismatch for ${JSON.stringify(ua)}`).toBe(isBot(ua));
    }
  });
});
