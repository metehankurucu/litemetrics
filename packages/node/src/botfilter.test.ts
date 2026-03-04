import { describe, it, expect } from 'vitest';
import { isBot } from './botfilter';

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
    ])('returns true for %s (%s)', (ua) => {
      expect(isBot(ua)).toBe(true);
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
