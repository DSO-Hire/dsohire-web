/**
 * Compute the current request's anonymous daily visitor id from request headers
 * + the current salt (build spec §4.2). Shared by the cookieless view recorder
 * (record-view.ts) and the goal recorder (record-goal.ts) so they all live in
 * the same anonymous visitor space as the /p/e beacon.
 *
 * The raw IP and User-Agent are read here as hash inputs ONLY and discarded
 * when this returns — never stored or logged. Returns null if no salt is
 * available; callers treat null as "skip dedup / skip", fail-silent.
 */

import { headers } from "next/headers";
import { computeVisitorId } from "./visitor-hash";
import { getCurrentSaltHex } from "./salt";

export async function getRequestVisitorId(): Promise<bigint | null> {
  const saltHex = await getCurrentSaltHex();
  if (!saltHex) return null;

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "";
  const ua = h.get("user-agent") || "";
  const host = h.get("host") || "dsohire.com";

  return computeVisitorId(Buffer.from(saltHex, "hex"), ip, ua, host);
}
