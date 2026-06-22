/**
 * Phase 1/2 pipeline checks — the pure server-side transforms the beacon runs
 * before anything is stored (build spec §3.1 strip, §4.5 channel, §4.3 derive +
 * bots). Standalone tsx assertion script (no test runner in repo):
 *
 *   npx tsx scripts/test-vantage-pipeline.ts
 *
 * The DB insert path (vantage_record_event / vantage_current_salt) is verified
 * separately against the live DB via SQL, since it needs the service-role env.
 */

import { stripPath } from "../src/lib/analytics/strip-path";
import { classifyChannel, normalizeReferrer } from "../src/lib/analytics/channel";
import { deriveDevice } from "../src/lib/analytics/derive";
import { isBotUA, isReferrerSpam } from "../src/lib/analytics/bots";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log("Vantage pipeline checks\n");

// --- §3.1 query strip (the PII firewall) -----------------------------------
const dirty = stripPath(
  "/pricing?utm_source=linkedin&utm_medium=social&email=secret@x.com&token=abc&foo=bar",
);
check(
  "strip: keeps only whitelisted params, sorted",
  dirty.path === "/pricing?utm_medium=social&utm_source=linkedin",
);
check("strip: PII param dropped (email)", !dirty.path.includes("email"));
check("strip: PII value dropped (secret@x.com)", !dirty.path.includes("secret"));
check("strip: non-whitelisted dropped (token, foo)", !/token|foo/.test(dirty.path));
check("strip: utm parsed", dirty.utm.source === "linkedin" && dirty.utm.medium === "social");

const plain = stripPath("/jobs");
check("strip: no query → bare path", plain.path === "/jobs" && plain.utm.source === null);

const refOnly = stripPath("/x?ref=charter-email");
check("strip: ref shorthand captured", refOnly.ref === "charter-email");

// --- §4.5 channel classification (GA4 grouping) ----------------------------
const N = { source: null, medium: null, campaign: null, term: null, content: null };
type C = Parameters<typeof classifyChannel>[1];
const utm = (o: Partial<C>): C => ({ ...N, ...o });

check("channel: no referrer, no utm → Direct", classifyChannel(null, N) === "Direct");
check("channel: google referrer → Organic Search", classifyChannel("google.com", N) === "Organic Search");
check("channel: l.facebook.com → Organic Social", classifyChannel("l.facebook.com", N) === "Organic Social");
check("channel: cpc + google → Paid Search", classifyChannel(null, utm({ source: "google", medium: "cpc" })) === "Paid Search");
check("channel: cpc + facebook → Paid Social", classifyChannel(null, utm({ source: "facebook", medium: "cpc" })) === "Paid Social");
check("channel: medium=email → Email", classifyChannel(null, utm({ medium: "email" })) === "Email");
check("channel: medium=organic → Organic Search", classifyChannel(null, utm({ medium: "organic" })) === "Organic Search");
check("channel: dentaltown referrer → Partner", classifyChannel("dentaltown.com", N) === "Partner");
check("channel: random blog → Referral", classifyChannel("someblog.example", N) === "Referral");
check("channel: bare utm_source, no referrer → Referral", classifyChannel(null, utm({ source: "charter-list" })) === "Referral");

check("normalize: l.facebook.com → Facebook", normalizeReferrer("l.facebook.com") === "Facebook");
check("normalize: t.co → Twitter/X", normalizeReferrer("t.co") === "Twitter/X");

// --- §4.3 device derivation ------------------------------------------------
const iphone = deriveDevice(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
);
check("derive: iPhone → iOS mobile", iphone.os === "iOS" && iphone.device === "mobile");
const win = deriveDevice(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
);
check("derive: Windows Chrome → desktop", win.browser === "Chrome" && win.os === "Windows" && win.device === "desktop");

// --- §4.3 bot / spam filtering ---------------------------------------------
check("bot: Googlebot UA → bot", isBotUA("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
check("bot: empty UA → bot", isBotUA(""));
check("bot: headless → bot", isBotUA("Mozilla/5.0 HeadlessChrome/120.0"));
check("bot: real Chrome → not bot", !isBotUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"));
check("spam: semalt.com → spam", isReferrerSpam("semalt.com"));
check("spam: google.com → not spam", !isReferrerSpam("google.com"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
