/**
 * Current-salt fetch with a short in-memory cache (build spec §4.2).
 *
 * The beacon needs the day's salt to compute the cookieless visitor hash. The
 * salt rotates daily, so we cache it per serverless instance for a few minutes
 * to avoid an RPC on every pageview. A stale cache at the midnight-UTC rotation
 * boundary briefly yields yesterday's hash — acceptable for v1 (the spec even
 * keeps the previous salt around for exactly this window).
 *
 * The salt is a server secret: it is never sent to the client, never logged,
 * and never stored in an event row.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: { hex: string; at: number } | null = null;

/**
 * Returns the current salt as a hex string, or null if none exists / the fetch
 * fails (caller treats null as "drop this event", fail-silent).
 */
export async function getCurrentSaltHex(): Promise<string | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.hex;

  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_current_salt");
    if (error || !data || typeof data !== "string") {
      // Serve a stale-but-recent salt if we have one rather than dropping.
      return cache?.hex ?? null;
    }
    cache = { hex: data, at: now };
    return data;
  } catch {
    return cache?.hex ?? null;
  }
}
