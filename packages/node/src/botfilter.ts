const BOT_PATTERNS = [
  // Headless browsers
  /HeadlessChrome/i,
  /PhantomJS/i,
  /Selenium/i,
  /Puppeteer/i,
  /Playwright/i,

  // Common bots
  /bot\b/i,
  /spider/i,
  /crawl/i,
  /slurp/i,
  /mediapartners/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /WhatsApp/i,
  /Discordbot/i,
  /TelegramBot/i,
  /Applebot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /DuckDuckBot/i,
  /Sogou/i,
  /Exabot/i,
  /ia_archiver/i,

  // HTTP libraries & API tools
  /PostmanRuntime/i,
  /axios/i,
  /node-fetch/i,
  /python-requests/i,
  /Go-http-client/i,
  /Java\//i,
  /libwww-perl/i,
  /wget/i,
  /curl/i,
  /httpie/i,

  // Monitoring / uptime
  /UptimeRobot/i,
  /Pingdom/i,
  /StatusCake/i,
  /Site24x7/i,
  /NewRelic/i,
  /Datadog/i,

  // Preview/embed
  /Slackbot/i,
  /Embedly/i,
  /Quora Link Preview/i,
  /redditbot/i,
  /Pinterestbot/i,
];

export function isBot(ua: string): boolean {
  if (!ua || ua.length === 0) return true;
  return BOT_PATTERNS.some((re) => re.test(ua));
}
