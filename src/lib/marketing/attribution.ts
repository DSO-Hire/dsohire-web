/**
 * First-touch attribution (client only).
 *
 * On the first marketing page view of a session we stash the landing path,
 * the external referrer, and any utm_* params. Every lead capture sends the
 * stash along, so /admin/leads can answer "which LinkedIn post / guide /
 * cold email actually produced this lead?" without an analytics vendor.
 *
 * sessionStorage (not a cookie): nothing leaves the browser until the
 * visitor chooses to submit a form. Every access is try/catch'd because
 * storage throws in some privacy modes.
 */

import type { LeadAttribution } from "./leads";

const KEY = "dh-first-touch";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    const url = new URL(window.location.href);
    const data: LeadAttribution = { landing: url.pathname };
    for (const k of UTM_KEYS) {
      const v = url.searchParams.get(k);
      if (v) data[k] = v.slice(0, 120);
    }
    const ref = document.referrer;
    if (ref) {
      try {
        const r = new URL(ref);
        if (r.host !== url.host) data.referrer = `${r.host}${r.pathname}`.slice(0, 300);
      } catch {
        /* malformed referrer, skip */
      }
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable, attribution is best-effort */
  }
}

export function readAttribution(): LeadAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LeadAttribution) : {};
  } catch {
    return {};
  }
}
