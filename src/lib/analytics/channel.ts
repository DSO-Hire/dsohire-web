/**
 * Attribution: referrer + UTM → channel (build spec §4.5).
 *
 * Classification follows GA4's default channel grouping, plus a B2B
 * Partner/Directory bucket (dental associations + directories are high-value
 * for us). Noisy referrer hosts are normalized to a friendly source name
 * (l.facebook.com → Facebook, t.co → Twitter/X, ...).
 *
 * All server-side. Pure functions — no I/O.
 */

import type { Utm } from "./strip-path";

export type Channel =
  | "Direct"
  | "Organic Search"
  | "Paid Search"
  | "Organic Social"
  | "Paid Social"
  | "Email"
  | "Referral"
  | "Partner";

// Host → friendly source. Collapses the many faces of each network.
const REFERRER_MAP: Record<string, string> = {
  "l.facebook.com": "Facebook",
  "lm.facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "www.facebook.com": "Facebook",
  "facebook.com": "Facebook",
  "t.co": "Twitter/X",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "out.reddit.com": "Reddit",
  "www.reddit.com": "Reddit",
  "reddit.com": "Reddit",
  "com.google.android.gm": "Gmail",
  "mail.google.com": "Gmail",
  "lnkd.in": "LinkedIn",
  "www.linkedin.com": "LinkedIn",
  "linkedin.com": "LinkedIn",
  "www.youtube.com": "YouTube",
  "youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
};

// Substring markers (matched against the host) for engines/networks whose
// hosts vary by TLD/subdomain too much to enumerate.
const SEARCH_ENGINES = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "ecosia.",
  "baidu.",
  "yandex.",
  "brave.",
  "startpage.",
];

const SOCIAL_NETWORKS = [
  "facebook",
  "instagram",
  "linkedin",
  "lnkd.in",
  "twitter",
  "t.co",
  "x.com",
  "reddit",
  "youtube",
  "tiktok",
  "pinterest",
  "threads.net",
  "bsky.app",
  "mastodon",
];

// B2B directories / dental associations (extend as we find them in the data).
const PARTNER_HOSTS = [
  "ada.org",
  "agd.org",
  "dentaltown.com",
  "glassdoor.",
  "indeed.",
  "ziprecruiter.",
];

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid-search",
  "cpm",
  "cpv",
  "display",
]);

const EMAIL_MEDIUMS = new Set(["email", "e-mail", "newsletter", "mail"]);
const SOCIAL_MEDIUMS = new Set([
  "social",
  "social-network",
  "social-media",
  "sm",
  "social network",
]);

function hostMatches(host: string, markers: string[]): boolean {
  return markers.some((m) => host.includes(m));
}

/** Normalize a referrer host to a friendly source name, or null if none. */
export function normalizeReferrer(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, "");
  if (REFERRER_MAP[host.toLowerCase()]) return REFERRER_MAP[host.toLowerCase()];
  if (REFERRER_MAP[h]) return REFERRER_MAP[h];
  return host.toLowerCase();
}

/**
 * Classify into a GA4-style channel. `referrerHost` is the lowercased host of
 * the Referer header (null if none); `utm` is the parsed whitelist.
 */
export function classifyChannel(
  referrerHost: string | null,
  utm: Utm,
): Channel {
  const medium = (utm.medium || "").toLowerCase().trim();
  const source = (utm.source || "").toLowerCase().trim();
  const host = (referrerHost || "").toLowerCase();

  const sourceIsSearch = hostMatches(source, SEARCH_ENGINES);
  const sourceIsSocial = SOCIAL_NETWORKS.some((s) => source.includes(s));
  const hostIsSearch = host !== "" && hostMatches(host, SEARCH_ENGINES);
  const hostIsSocial =
    host !== "" && SOCIAL_NETWORKS.some((s) => host.includes(s));
  const hostIsPartner = host !== "" && hostMatches(host, PARTNER_HOSTS);

  // Paid first — medium is the strongest signal.
  if (PAID_MEDIUMS.has(medium)) {
    if (sourceIsSearch || hostIsSearch) return "Paid Search";
    if (sourceIsSocial || hostIsSocial) return "Paid Social";
    return "Paid Search"; // generic paid → treat as search-side spend
  }

  // Email.
  if (EMAIL_MEDIUMS.has(medium)) return "Email";

  // Explicit social medium, or organic social referrer.
  if (SOCIAL_MEDIUMS.has(medium) || sourceIsSocial) return "Organic Social";
  if (hostIsSocial) return "Organic Social";

  // Organic search (medium=organic, or a search-engine referrer).
  if (medium === "organic" || sourceIsSearch || hostIsSearch) {
    return "Organic Search";
  }

  // B2B partner/directory referral.
  if (hostIsPartner) return "Partner";

  // Any other referrer host → Referral.
  if (host !== "") return "Referral";

  // A bare utm_source with no referrer (e.g. a charter outreach link) is still
  // attributable — call it Referral so it doesn't masquerade as Direct.
  if (source !== "") return "Referral";

  return "Direct";
}
