/**
 * /api/cron/automation-rules — time-based automation triggers (N13 Phase 3).
 *
 * Currently drives `application.idle_in_stage`: for each DSO with an enabled
 * idle rule, find applications sitting in a non-terminal stage past the
 * rule's day threshold and fire the trigger. The engine then evaluates each
 * rule's `days_in_stage >= N` (+ optional stage/job) conditions and runs the
 * internal actions (notify_teammate / add_tag / assign), deduping via the
 * automation_rule_runs ledger so a stale application fires ONCE per
 * stage-entry, not every cron pass.
 *
 * Auth: Bearer ${CRON_SECRET} (same as the other crons). Driven hourly from
 * GitHub Actions (.github/workflows/automation-rules.yml) because Vercel
 * Hobby rejects sub-daily vercel.json crons. Service-role client (no per-user
 * context in a cron).
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { runAutomationsForEvent } from "@/lib/automations/engine";
import { KANBAN_KINDS, KIND_DEFAULT_LABELS, type StageKind } from "@/lib/applications/stages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_IDLE_DAYS = 7;
const ACTIVE_KINDS = new Set<StageKind>(KANBAN_KINDS);
const MAX_APPS_PER_DSO = 2000;

/** Pull the smallest `days_in_stage >= N` threshold out of a rule's conditions. */
function thresholdFromConditions(conditions: unknown): number {
  if (!Array.isArray(conditions)) return DEFAULT_IDLE_DAYS;
  for (const c of conditions as Array<Record<string, unknown>>) {
    if (c?.field === "days_in_stage" && c?.op === "gte") {
      const n = Number(c.value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return DEFAULT_IDLE_DAYS;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const now = Date.now();
  const report = { dsos: 0, scanned: 0, fired: 0, errors: [] as string[] };

  // 1. Enabled idle rules → per-DSO floor threshold (min across its rules).
  const { data: ruleRows, error: ruleErr } = await admin
    .from("automation_rules")
    .select("dso_id, conditions")
    .eq("trigger_kind", "application.idle_in_stage")
    .eq("is_enabled", true);
  if (ruleErr) {
    return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  }

  const floorByDso = new Map<string, number>();
  for (const r of (ruleRows as Array<Record<string, unknown>> | null) ?? []) {
    const dso = r.dso_id as string;
    const threshold = thresholdFromConditions(r.conditions);
    floorByDso.set(dso, Math.min(floorByDso.get(dso) ?? Infinity, threshold));
  }

  // 2. Per DSO with idle rules: scan applications past the floor, fire events.
  for (const [dsoId, floorDays] of floorByDso) {
    report.dsos++;
    try {
      const { data: jobRows } = await admin
        .from("jobs")
        .select("id, title")
        .eq("dso_id", dsoId);
      const jobs = (jobRows as Array<{ id: string; title: string | null }> | null) ?? [];
      if (jobs.length === 0) continue;
      const jobTitle = new Map(jobs.map((j) => [j.id, j.title ?? "the job"]));
      const jobIds = jobs.map((j) => j.id);

      const floorIso = new Date(now - floorDays * 86400000).toISOString();
      const { data: appRows } = await admin
        .from("applications")
        .select(
          "id, job_id, candidate_id, stage_id, stage_entered_at, " +
            "stage:dso_pipeline_stages!stage_id(kind, label)"
        )
        .in("job_id", jobIds)
        .lte("stage_entered_at", floorIso)
        .limit(MAX_APPS_PER_DSO);

      for (const a of (appRows as Array<Record<string, unknown>> | null) ?? []) {
        const stageRel = a.stage as
          | { kind: string; label: string }
          | Array<{ kind: string; label: string }>
          | null;
        const stageRow = Array.isArray(stageRel) ? stageRel[0] ?? null : stageRel;
        const kind = (stageRow?.kind as string | undefined) ?? "open";
        if (!ACTIVE_KINDS.has(kind as StageKind)) continue; // skip terminal/hired

        const enteredAt = a.stage_entered_at as string;
        const daysInStage = Math.floor((now - new Date(enteredAt).getTime()) / 86400000);
        report.scanned++;

        const applicationId = a.id as string;
        const stageId = a.stage_id as string;
        await runAutomationsForEvent({
          trigger: "application.idle_in_stage",
          applicationId,
          dsoId,
          candidateId: (a.candidate_id as string | null) ?? null,
          jobId: a.job_id as string,
          jobTitle: jobTitle.get(a.job_id as string) ?? "the job",
          toKind: kind as StageKind,
          stageId,
          stageLabel:
            (stageRow?.label as string | undefined) ??
            KIND_DEFAULT_LABELS[kind as StageKind] ??
            kind,
          daysInStage,
          // Deterministic per stage-entry → fires once, re-runs dedup; a later
          // re-entry (new stage_entered_at) yields a fresh key.
          triggerEventKey: `idle:${applicationId}:${stageId}:${enteredAt}`,
        });
        report.fired++;
      }
    } catch (err) {
      report.errors.push(`${dsoId}: ${String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, ...report });
}
