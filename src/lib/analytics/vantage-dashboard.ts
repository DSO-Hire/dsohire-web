/**
 * Vantage dashboard data loaders (build spec §7).
 *
 * Thin typed wrappers over the service_role-only read RPCs (migration
 * 20260622030000). The analytics schema is off the REST surface, so all reads
 * go through these RPCs. Each loader is fail-safe: on error it returns an empty/
 * zero result rather than throwing (the dashboard renders "no data" instead of
 * 500-ing). Reused by the dashboard page, the founder digest, and summary.json.
 *
 * Counts come back from PostgREST as numbers-or-strings depending on size; we
 * Number()-coerce everything so callers always get real numbers.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface WindowCount {
  visitors: number;
  pageviews: number;
}
export interface VantageOverview {
  today: WindowCount;
  last7: WindowCount;
  last30: WindowCount;
  live5min: number;
}
export interface ChannelRow {
  channel: string;
  visitors: number;
  pageviews: number;
}
export interface PageRow {
  path: string;
  pageviews: number;
  visitors: number;
}
export interface GoalRow {
  event_name: string;
  visitors: number;
  events: number;
}
export interface LoopRow {
  channel: string;
  employer_signups: number;
  employer_paying: number;
  candidate_signups: number;
}

const EMPTY_WINDOW: WindowCount = { visitors: 0, pageviews: 0 };
const EMPTY_OVERVIEW: VantageOverview = {
  today: EMPTY_WINDOW,
  last7: EMPTY_WINDOW,
  last30: EMPTY_WINDOW,
  live5min: 0,
};

function win(v: unknown): WindowCount {
  const o = (v ?? {}) as { visitors?: unknown; pageviews?: unknown };
  return { visitors: Number(o.visitors ?? 0), pageviews: Number(o.pageviews ?? 0) };
}

export async function loadVantageOverview(): Promise<VantageOverview> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_overview");
    if (error || !data) return EMPTY_OVERVIEW;
    const d = data as Record<string, unknown>;
    return {
      today: win(d.today),
      last7: win(d.last7),
      last30: win(d.last30),
      live5min: Number(d.live5min ?? 0),
    };
  } catch {
    return EMPTY_OVERVIEW;
  }
}

export async function loadVantageChannels(days: number): Promise<ChannelRow[]> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_channels", { p_days: days });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      channel: String(r.channel ?? "Direct"),
      visitors: Number(r.visitors ?? 0),
      pageviews: Number(r.pageviews ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function loadVantageTopPages(
  days: number,
  limit: number,
): Promise<PageRow[]> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_top_pages", {
      p_days: days,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      path: String(r.path ?? "(unknown)"),
      pageviews: Number(r.pageviews ?? 0),
      visitors: Number(r.visitors ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function loadVantageGoals(days: number): Promise<GoalRow[]> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_goals", { p_days: days });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      event_name: String(r.event_name ?? ""),
      visitors: Number(r.visitors ?? 0),
      events: Number(r.events ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function loadVantageLoop(): Promise<LoopRow[]> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("vantage_acquisition_loop");
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      channel: String(r.channel ?? "(unknown)"),
      employer_signups: Number(r.employer_signups ?? 0),
      employer_paying: Number(r.employer_paying ?? 0),
      candidate_signups: Number(r.candidate_signups ?? 0),
    }));
  } catch {
    return [];
  }
}

/** Look up a goal's distinct-visitor count by name (funnel helper). */
export function goalVisitors(goals: GoalRow[], name: string): number {
  return goals.find((g) => g.event_name === name)?.visitors ?? 0;
}
