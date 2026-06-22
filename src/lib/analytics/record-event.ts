/**
 * Fail-silent Vantage event insert (build spec §4.3 / §4.7).
 *
 * Mirrors recordJobView/recordApplicationStart: service-role client, errors
 * swallowed — an analytics write must NEVER block or break a user flow. The
 * insert goes through the public.vantage_record_event RPC (SECURITY DEFINER,
 * service_role-only) so the analytics schema stays off the REST surface.
 *
 * Shared by the pageview beacon (/p/e) and the goal recorder (record-goal.ts).
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Utm } from "./strip-path";

export const EVENT_TYPE_PAGEVIEW = 1 as const;
export const EVENT_TYPE_GOAL = 2 as const;

export interface VantageEventInput {
  eventType: number;
  eventName: string;
  visitorId: bigint;
  sessionId: bigint | null;
  path: string | null;
  referrerHost: string | null;
  channel: string | null;
  utm: Utm;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  region: string | null;
  props?: Record<string, unknown> | null;
}

export async function recordEvent(e: VantageEventInput): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    // bigint → string: PostgREST RPC args are JSON, which can't carry an int64
    // safely. The RPC casts these back to bigint server-side.
    const { error } = await admin.rpc("vantage_record_event", {
      p_event_type: e.eventType,
      p_event_name: e.eventName,
      p_visitor_id: e.visitorId.toString(),
      p_session_id: e.sessionId == null ? null : e.sessionId.toString(),
      p_path: e.path,
      p_referrer_host: e.referrerHost,
      p_channel: e.channel,
      p_utm_source: e.utm.source,
      p_utm_medium: e.utm.medium,
      p_utm_campaign: e.utm.campaign,
      p_utm_term: e.utm.term,
      p_utm_content: e.utm.content,
      p_browser: e.browser,
      p_os: e.os,
      p_device: e.device,
      p_country: e.country,
      p_region: e.region,
      p_props: e.props ?? null,
    });
    if (error) console.warn("[vantage] record failed", error.message);
  } catch (err) {
    console.warn("[vantage] record threw", err);
  }
}
