#!/usr/bin/env node
/**
 * One-shot IndexNow submit of every URL in the LIVE sitemap.
 *
 *   node scripts/indexnow-submit.mjs            # submit
 *   node scripts/indexnow-submit.mjs --dry-run  # list what would be sent
 *
 * Run manually after a deploy that adds or changes public pages. The daily
 * /api/cron/indexnow job does the same thing on a schedule.
 *
 * The key is read from src/lib/seo/indexnow.ts (single source of truth), and
 * the script checks that https://dsohire.com/<key>.txt serves it before
 * submitting, since IndexNow rejects keys it can't verify.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HOST = "dsohire.com";
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;
const dryRun = process.argv.includes("--dry-run");

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "../src/lib/seo/indexnow.ts"), "utf8");
const key = src.match(/INDEXNOW_KEY\s*=\s*"([0-9a-f]{32})"/)?.[1];
if (!key) {
  console.error("Could not read INDEXNOW_KEY from src/lib/seo/indexnow.ts");
  process.exit(1);
}
const keyLocation = `https://${HOST}/${key}.txt`;

function locs(xml) {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const xml = await fetchText(SITEMAP_URL);
  let urls = locs(xml);
  // Sitemap index support: follow child sitemaps.
  if (/<sitemapindex/i.test(xml)) {
    const children = urls;
    urls = [];
    for (const child of children) urls.push(...locs(await fetchText(child)));
  }
  urls = Array.from(
    new Set(urls.filter((u) => u.startsWith(`https://${HOST}/`) || u === `https://${HOST}`)),
  );
  console.log(`${urls.length} URLs in ${SITEMAP_URL}`);
  if (urls.length === 0) process.exit(1);

  if (dryRun) {
    for (const u of urls) console.log(u);
    return;
  }

  const served = (await fetchText(keyLocation)).trim();
  if (served !== key) {
    console.error(`${keyLocation} does not serve the key (got "${served.slice(0, 40)}"). Deploy first.`);
    process.exit(1);
  }

  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    const batch = urls.slice(i, i + MAX_URLS_PER_REQUEST);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key, keyLocation, urlList: batch }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text().catch(() => "");
    console.log(`batch ${i / MAX_URLS_PER_REQUEST + 1}: ${batch.length} URLs -> HTTP ${res.status} ${body.slice(0, 200)}`);
    if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
