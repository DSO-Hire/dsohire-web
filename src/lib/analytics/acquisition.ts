/**
 * Closed-loop acquisition stamping (build spec §4.6).
 *
 * At a conversion (employer/candidate sign-up) we stamp the last-touch
 * acquisition channel + source onto the created record (dsos/candidates). The
 * founder dashboard then joins AGGREGATES — "Channel X → N signups → N paying
 * → $Y MRR" — without ever linking an individual's anonymous pageviews to their
 * account. Paying/MRR is read from the subscriptions table joined by dso_id, so
 * no acquisition column is needed there.
 *
 * Last-touch by design: we're cookieless, so we do NOT persist per-person
 * first-touch across sessions (that would need the device storage the firewall
 * forbids). The signal is whatever the conversion request's Referer/UTM carry.
 */

import { headers } from "next/headers";
import { stripPath } from "./strip-path";
import { classifyChannel, normalizeReferrer } from "./channel";

export interface Acquisition {
  channel: string;
  source: string | null;
}

export async function getAcquisition(): Promise<Acquisition> {
  try {
    const h = await headers();
    const referer = h.get("referer") || "";
    let referrerHost: string | null = null;
    let pagePath = "/";
    if (referer) {
      try {
        const u = new URL(referer);
        referrerHost = u.host.toLowerCase();
        pagePath = `${u.pathname}${u.search}`;
      } catch {
        /* keep defaults */
      }
    }
    const { utm } = stripPath(pagePath);
    return {
      channel: classifyChannel(referrerHost, utm),
      source: utm.source || normalizeReferrer(referrerHost) || null,
    };
  } catch {
    return { channel: "Direct", source: null };
  }
}
