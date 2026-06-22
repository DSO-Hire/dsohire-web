/**
 * /p/e — Vantage first-party beacon (build spec §4.3).
 *
 * Neutral path (NOT /analytics/...) for ad-blocker resilience, never derived
 * from the product name. Two entry points:
 *   POST  — navigator.sendBeacon (JSON body {n,u,r,w}); replies 204.
 *   GET   — 1×1 GIF pixel fallback for no-JS / no-sendBeacon (params n,u,r,w);
 *           replies with the GIF.
 *
 * PRIVACY FIREWALL (the whole point of building our own):
 *   - The raw IP and User-Agent are read here as HASH/DERIVE INPUTS ONLY. They
 *     live solely inside the request scope + the after() closure, are folded
 *     into the visitor hash (in Node, salt never persisted with them), and are
 *     never stored, logged, or placed in props.
 *   - The URL is query-stripped to the §3.1 whitelist BEFORE storage.
 *   - The insert is fail-silent and runs post-response via after() so the 204
 *     is never blocked.
 */

import { after, NextResponse, type NextRequest } from "next/server";
import { computeVisitorId, computeSessionId } from "@/lib/analytics/visitor-hash";
import { getCurrentSaltHex } from "@/lib/analytics/salt";
import { recordEvent, EVENT_TYPE_PAGEVIEW } from "@/lib/analytics/record-event";
import { deriveDevice } from "@/lib/analytics/derive";
import { isBotUA, isReferrerSpam } from "@/lib/analytics/bots";
import { stripPath } from "@/lib/analytics/strip-path";
import { classifyChannel } from "@/lib/analytics/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1×1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "content-length": String(PIXEL.length),
      "cache-control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

interface Beacon {
  n?: string; // event name
  u?: string; // path + (whitelisted) query
  r?: string; // referrer
}

function handle(
  req: NextRequest,
  beacon: Beacon,
  respond: () => NextResponse,
): NextResponse {
  try {
    const ua = req.headers.get("user-agent") || "";
    // Bot UA gate — drop without recording.
    if (isBotUA(ua)) return respond();

    const referrer = (beacon.r || "").toString();
    let referrerHost: string | null = null;
    if (referrer) {
      try {
        referrerHost = new URL(referrer).host.toLowerCase();
      } catch {
        referrerHost = null;
      }
    }
    if (isReferrerSpam(referrerHost)) return respond();

    // Hash inputs — request-scoped only; discarded after the closure runs.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const host = req.headers.get("host") || "dsohire.com";

    // Coarse geo from Vercel edge headers — never the raw IP.
    const country = req.headers.get("x-vercel-ip-country") || null;
    const region = req.headers.get("x-vercel-ip-country-region") || null;

    const name = (beacon.n || "pageview").toString().slice(0, 64);
    const { path, utm } = stripPath((beacon.u || "/").toString());
    const channel = classifyChannel(referrerHost, utm);
    const device = deriveDevice(ua);
    const utcDate = new Date().toISOString().slice(0, 10);

    // Compute the hash + insert AFTER the response is sent (so the 204 isn't
    // blocked). ip/ua are captured here and never leave this closure.
    after(async () => {
      const saltHex = await getCurrentSaltHex();
      if (!saltHex) return; // no salt → drop, fail-silent
      const salt = Buffer.from(saltHex, "hex");
      const visitorId = computeVisitorId(salt, ip, ua, host);
      const sessionId = computeSessionId(visitorId, utcDate, host);
      await recordEvent({
        eventType: EVENT_TYPE_PAGEVIEW,
        eventName: name,
        visitorId,
        sessionId,
        path,
        referrerHost,
        channel,
        utm,
        browser: device.browser,
        os: device.os,
        device: device.device,
        country,
        region,
        props: null,
      });
    });

    return respond();
  } catch {
    // Never throw out of the beacon.
    return respond();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let beacon: Beacon = {};
  try {
    beacon = JSON.parse(await req.text()) as Beacon;
  } catch {
    // Malformed body → still 204, record nothing.
  }
  return handle(req, beacon, noContent);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const beacon: Beacon = {
    n: sp.get("n") ?? undefined,
    u: sp.get("u") ?? undefined,
    r: sp.get("r") ?? undefined,
  };
  return handle(req, beacon, pixelResponse);
}
