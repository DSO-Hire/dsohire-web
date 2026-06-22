/**
 * Query-string stripping (build spec §3.1) — the easiest PII leak is a URL like
 * `/x?email=a@b.com` landing in `path`. We WHITELIST a tiny set of attribution
 * params and drop everything else before anything is stored.
 *
 * Whitelist-not-blacklist on purpose: a blacklist misses the next param name
 * someone invents. Only these survive.
 */

export const ALLOWED_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
] as const;

export interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

export interface StrippedPath {
  /** pathname + the whitelisted query (sorted, deterministic), e.g. `/pricing?utm_source=linkedin`. */
  path: string;
  utm: Utm;
  /** `ref`/`source` shorthand params, used as a referrer fallback by the channel classifier. */
  ref: string | null;
}

/**
 * `rawUrl` is the client-sent path (`location.pathname` + optional `?query`).
 * We re-parse and re-strip server-side regardless of what the client sent —
 * never trust the client to have stripped PII.
 */
export function stripPath(rawUrl: string): StrippedPath {
  let pathname = "/";
  let search = "";
  try {
    // Base is irrelevant — we only keep pathname + search.
    const u = new URL(rawUrl, "https://dsohire.com");
    pathname = u.pathname || "/";
    search = u.search;
  } catch {
    // Malformed — keep the path part before any `?`, drop the rest.
    pathname = rawUrl.split("?")[0] || "/";
  }

  const incoming = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ALLOWED_QUERY_KEYS) {
    const v = incoming.get(key);
    if (v) kept.set(key, v);
  }
  kept.sort(); // deterministic ordering so identical visits group cleanly

  const qs = kept.toString();
  return {
    path: qs ? `${pathname}?${qs}` : pathname,
    utm: {
      source: kept.get("utm_source"),
      medium: kept.get("utm_medium"),
      campaign: kept.get("utm_campaign"),
      term: kept.get("utm_term"),
      content: kept.get("utm_content"),
    },
    ref: kept.get("ref") || kept.get("source"),
  };
}
