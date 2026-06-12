/**
 * Per-DSO median first-response time — Lane 7 (Career HQ, Model 06).
 *
 * Powers the candidate-side journey line "this practice typically
 * responds within ~N days." HONESTY RULES (locked with Cam):
 *   • Real medians from real behavior only — never a marketing number.
 *   • ≥5 responded applications in the window or we show NOTHING
 *     (same thin-history doctrine as stage-dwell norms, Lane 5).
 *   • "Response" = the first thing the DSO did that the candidate can
 *     see: an employer stage move (status event, actor_type='employer')
 *     or an employer message — whichever came first.
 *   • Median is over applications that GOT a response. That answers
 *     "when they respond, how fast?" — the question the waiting
 *     candidate is actually asking. We deliberately do not blend in
 *     never-responded apps (that's a response-RATE question, different
 *     surface, different fix).
 *   • Trailing 90 days, so a practice that cleaned up its act isn't
 *     haunted by last year's inbox.
 *
 * Service-role on purpose: the median aggregates across OTHER
 * candidates' applications, which candidate RLS rightly can't see.
 * Only the derived number (days) ever leaves this module — no rows,
 * no names, nothing identifying.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const WINDOW_DAYS = 90;
const MIN_SAMPLES = 5;
/** Row caps keep the dashboard query bounded on big DSOs. */
const MAX_APPS_PER_BATCH = 400;
const MAX_EVENT_ROWS = 4000;

/**
 * Median days-to-first-employer-response per DSO, trailing 90 days.
 * Returns only DSOs that clear the ≥5-sample gate; callers treat a
 * missing key as "say nothing."
 */
export async function getDsoResponseMedians(
  dsoIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = Array.from(new Set(dsoIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const admin = createSupabaseServiceRoleClient();
  const cutoff = new Date(
    Date.now() - WINDOW_DAYS * 86400000,
  ).toISOString();

  // 1) Jobs for these DSOs (shallow query — no nested embeds).
  const { data: jobRows } = await admin
    .from("jobs")
    .select("id, dso_id")
    .in("dso_id", ids);
  const dsoByJobId = new Map<string, string>();
  for (const j of (jobRows ?? []) as Array<{ id: string; dso_id: string }>) {
    dsoByJobId.set(j.id, j.dso_id);
  }
  if (dsoByJobId.size === 0) return out;

  // 2) Recent applications on those jobs (newest first, capped).
  const { data: appRows } = await admin
    .from("applications")
    .select("id, job_id, created_at")
    .in("job_id", Array.from(dsoByJobId.keys()))
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_APPS_PER_BATCH);
  const apps = (appRows ?? []) as Array<{
    id: string;
    job_id: string;
    created_at: string;
  }>;
  if (apps.length === 0) return out;
  const appIds = apps.map((a) => a.id);

  // 3) First employer-visible response per application. Two shallow
  //    pulls (events + messages), ascending so the FIRST row we see
  //    per app is the first response.
  const [{ data: evRows }, { data: msgRows }] = await Promise.all([
    admin
      .from("application_status_events")
      .select("application_id, created_at")
      .in("application_id", appIds)
      .eq("actor_type", "employer")
      .order("created_at", { ascending: true })
      .limit(MAX_EVENT_ROWS),
    admin
      .from("application_messages")
      .select("application_id, created_at")
      .in("application_id", appIds)
      .eq("sender_role", "employer")
      .order("created_at", { ascending: true })
      .limit(MAX_EVENT_ROWS),
  ]);

  const firstResponseByAppId = new Map<string, number>();
  const note = (rows: unknown) => {
    for (const r of (rows ?? []) as Array<{
      application_id: string;
      created_at: string;
    }>) {
      const ts = new Date(r.created_at).getTime();
      const prev = firstResponseByAppId.get(r.application_id);
      if (prev == null || ts < prev) firstResponseByAppId.set(r.application_id, ts);
    }
  };
  note(evRows);
  note(msgRows);

  // 4) Per-DSO medians over responded apps, gated.
  const samplesByDso = new Map<string, number[]>();
  for (const a of apps) {
    const responded = firstResponseByAppId.get(a.id);
    if (responded == null) continue;
    const dsoId = dsoByJobId.get(a.job_id);
    if (!dsoId) continue;
    const days = (responded - new Date(a.created_at).getTime()) / 86400000;
    if (days < 0) continue; // clock skew / imported rows — don't poison the median
    const arr = samplesByDso.get(dsoId) ?? [];
    arr.push(days);
    samplesByDso.set(dsoId, arr);
  }
  for (const [dsoId, samples] of samplesByDso) {
    if (samples.length < MIN_SAMPLES) continue;
    samples.sort((x, y) => x - y);
    const mid = Math.floor(samples.length / 2);
    const median =
      samples.length % 2 === 1
        ? samples[mid]
        : (samples[mid - 1] + samples[mid]) / 2;
    // Round to whole days, minimum 1 — "within ~0 days" reads broken.
    out.set(dsoId, Math.max(1, Math.round(median)));
  }
  return out;
}
