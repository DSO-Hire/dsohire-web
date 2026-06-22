/**
 * Layered, cheap bot/spam filtering (build spec §4.3).
 *
 * The beacon being JS-driven already filters most dumb crawlers (they don't run
 * JS). On top of that:
 *   - UA bot denylist — a compact regex distilled from arcjet/well-known-bots.
 *   - Referrer-spam host list — a representative subset of matomo's list.
 *   - Client-side `navigator.webdriver` headless guard lives in the inline
 *     beacon (it never even fires for automated browsers).
 *
 * NOT implemented in v1: datacenter-IP filtering. It needs an ASN/IP-range
 * dataset we don't ship (and we deliberately don't add a GeoIP DB — §10). The
 * JS gate + UA denylist + webdriver guard cover the common cases; revisit with
 * an ASN list if bot noise shows up in the data.
 */

// Single case-insensitive pass over the UA. Covers crawlers, headless
// browsers, HTTP libraries, monitors, and preview/scraper bots.
const BOT_UA =
  /bot\b|crawl|spider|slurp|mediapartners|adsbot|bingpreview|headless|phantomjs|puppeteer|playwright|selenium|python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|libwww|java\/|jakarta|go-http-client|okhttp|node-fetch|axios\/|scrapy|httpunit|apache-httpclient|facebookexternalhit|facebookcatalog|embedly|quora link preview|pinterest\/|whatsapp|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|google-inspectiontool|googleother|chrome-lighthouse|gtmetrix|pingdom|uptimerobot|statuscake|site24x7|datadog|newrelic|semrush|ahrefs|mj12bot|dotbot|dataforseo|petalbot|bytespider|amazonbot|gptbot|claudebot|ccbot|perplexitybot|applebot|yandex|baiduspider|sogou|duckduckbot|archive\.org_bot|ia_archiver/i;

export function isBotUA(ua: string | null | undefined): boolean {
  // Empty UA is itself bot-like — real browsers always send one via sendBeacon.
  if (!ua) return true;
  return BOT_UA.test(ua);
}

// Representative subset of the matomo referrer-spam list (the full list is
// thousands of hosts; these are the perennial offenders). Extend from the data.
const REFERRER_SPAM = new Set<string>([
  "semalt.com",
  "buttons-for-website.com",
  "darodar.com",
  "best-seo-offer.com",
  "best-seo-solution.com",
  "free-share-buttons.com",
  "social-buttons.com",
  "7makemoneyonline.com",
  "event-tracking.com",
  "get-free-traffic-now.com",
  "trafficmonetizer.org",
  "success-seo.com",
  "simple-share-buttons.com",
  "100dollars-seo.com",
  "floating-share-buttons.com",
  "video--production.com",
  "4webmasters.org",
]);

export function isReferrerSpam(host: string | null | undefined): boolean {
  if (!host) return false;
  return REFERRER_SPAM.has(host.toLowerCase().replace(/^www\./, ""));
}
