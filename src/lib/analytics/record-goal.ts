/**
 * Server-side goal recorder (build spec §4.7).
 *
 * Fired at conversion touchpoints from server actions/routes — more reliable
 * than a client beacon for server-action conversions. Recomputes the anonymous
 * daily visitor id from the current request (request-visitor.ts) so goals share
 * the same visitor space as /p/e pageviews, enabling funnel math.
 *
 * Same fail-silent contract as recordJobView: never throws into a user flow.
 * props must be NON-PII (plan tier, role category) — never names/emails.
 */

import { headers } from "next/headers";
import { getRequestVisitorId } from "./request-visitor";
import { computeSessionId } from "./visitor-hash";
import { recordEvent, EVENT_TYPE_GOAL } from "./record-event";
import { deriveDevice } from "./derive";
import { stripPath } from "./strip-path";
import { classifyChannel } from "./channel";

export async function recordGoal(
  name: string,
  props?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const visitorId = await getRequestVisitorId();
    if (visitorId == null) return; // no salt → skip (visitor_id is NOT NULL)

    const h = await headers();
    const ua = h.get("user-agent") || "";
    const host = h.get("host") || "dsohire.com";

    // The Referer of a server-action request is the page the user converted
    // from — parse it for last-touch channel + the page path.
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

    const { path, utm } = stripPath(pagePath);
    const channel = classifyChannel(referrerHost, utm);
    const device = deriveDevice(ua);
    const utcDate = new Date().toISOString().slice(0, 10);

    await recordEvent({
      eventType: EVENT_TYPE_GOAL,
      eventName: name,
      visitorId,
      sessionId: computeSessionId(visitorId, utcDate, host),
      path,
      referrerHost,
      channel,
      utm,
      browser: device.browser,
      os: device.os,
      device: device.device,
      country: h.get("x-vercel-ip-country") || null,
      region: h.get("x-vercel-ip-country-region") || null,
      props: props ?? null,
    });
  } catch (err) {
    console.warn("[vantage] goal failed", err);
  }
}
