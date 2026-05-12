/**
 * /api/cron/weekly-digest — Monday-morning digest (Phase 5C / E6.10).
 *
 * Schedule (vercel.json): every Monday at 13:00 UTC = 8am US Central.
 *
 * For each DSO that has at least one owner/admin team member, computes
 * the past 7 days of activity (apps received, hires, top jobs by apps,
 * stale candidates >14 days in stage) and emails each owner/admin a
 * styled WeeklyDigest. Suppresses the send if a DSO had zero apps and
 * zero hires and zero stale candidates this week — avoids empty noise.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to all
 * cron invocations. Reject anything without it.
 *
 * Idempotency: re-running this within the same week would re-send the
 * digest. Vercel cron only fires once per scheduled time, so in
 * practice this isn't a concern. If we add a manual retrigger surface,
 * gate by an idempotency_log row keyed by (dso_id, week_iso).
 */

import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  type createSupabaseServerClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import {
  WeeklyDigest,
  type WeeklyDigestTopJob,
  type WeeklyDigestStaleCandidate,
} from "@/emails/employer/WeeklyDigest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
void ({} as ServerClient);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

// Keyed by stage kind (the system category snapshot). Per-DSO labels
// intentionally aren't used in the weekly digest copy — the canonical
// label keeps the email coherent across the customer base.
const STAGE_LABEL: Record<string, string> = {
  open: "Applied",
  screen: "Screening",
  interview: "Interview",
  offer: "Offered",
};

interface DigestReport {
  dsos_evaluated: number;
  dsos_skipped_empty: number;
  emails_sent: number;
  emails_failed: number;
  errors: string[];
}

function weekRangeLabel(): string {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const report: DigestReport = {
    dsos_evaluated: 0,
    dsos_skipped_empty: 0,
    emails_sent: 0,
    emails_failed: 0,
    errors: [],
  };

  // 1. Active DSOs (not soft-deleted).
  const { data: dsos } = await admin
    .from("dsos")
    .select("id, name")
    .is("deleted_at", null);

  for (const dso of (dsos ?? []) as Array<{ id: string; name: string }>) {
    report.dsos_evaluated += 1;
    try {
      const digest = await buildDigestForDso(admin, dso.id, dso.name);
      if (digest === null) {
        report.dsos_skipped_empty += 1;
        continue;
      }

      // Recipients: owner + admin role users.
      const { data: members } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name, role")
        .eq("dso_id", dso.id)
        .in("role", ["owner", "admin"]);

      for (const m of (members ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
        role: string;
      }>) {
        try {
          const res = await admin.auth.admin.getUserById(m.auth_user_id);
          const email = res.data?.user?.email ?? null;
          if (!email) continue;
          const firstName =
            m.full_name?.trim().split(/\s+/)[0] ?? null;
          await sendEmail({
            to: email,
            subject: `Weekly hiring digest · ${dso.name}`,
            template: "employer.weekly_digest",
            relatedDsoId: dso.id,
            react: WeeklyDigest({
              recipientFirstName: firstName ?? "there",
              dsoName: dso.name,
              weekRangeLabel: digest.weekRangeLabel,
              applicationsThisWeek: digest.applicationsThisWeek,
              applicationsLastWeek: digest.applicationsLastWeek,
              hiresThisWeek: digest.hiresThisWeek,
              openRoles: digest.openRoles,
              topJobs: digest.topJobs,
              staleCandidates: digest.staleCandidates,
              dashboardUrl: `${SITE_URL}/employer/reports`,
            }),
          });
          report.emails_sent += 1;
        } catch (err) {
          report.emails_failed += 1;
          report.errors.push(
            `email-fail dso=${dso.id} user=${m.auth_user_id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } catch (err) {
      report.errors.push(
        `dso-fail ${dso.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json(report);
}

interface DigestData {
  weekRangeLabel: string;
  applicationsThisWeek: number;
  applicationsLastWeek: number;
  hiresThisWeek: number;
  openRoles: number;
  topJobs: WeeklyDigestTopJob[];
  staleCandidates: WeeklyDigestStaleCandidate[];
}

async function buildDigestForDso(
  admin: AdminClient,
  dsoId: string,
  dsoName: string
): Promise<DigestData | null> {
  void dsoName;
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
  const since14 = new Date(now.getTime() - 14 * 86400 * 1000).toISOString();

  // Open roles count.
  const { count: openRoles } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", dsoId)
    .eq("status", "active")
    .is("deleted_at", null);

  // Pull all jobs for this DSO so we can filter applications client-side
  // (flat queries — feedback_supabase_error_swallowing nested-embed bug).
  const { data: jobsRows } = await admin
    .from("jobs")
    .select("id, title, status")
    .eq("dso_id", dsoId);
  const jobIds = (jobsRows ?? []).map((j) => j.id as string);
  const jobMap = new Map(
    ((jobsRows ?? []) as Array<{ id: string; title: string; status: string }>).map(
      (j) => [j.id, j]
    )
  );
  if (jobIds.length === 0) return null;

  // Apps this week + last week.
  const { data: appsThisWeekRows } = await admin
    .from("applications")
    .select(
      "id, job_id, stage_id, stage_entered_at, candidate_id, " +
        "stage:dso_pipeline_stages!stage_id(kind)"
    )
    .in("job_id", jobIds)
    .gte("created_at", since7);
  const { count: appsLastWeek } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .in("job_id", jobIds)
    .gte("created_at", since14)
    .lt("created_at", since7);

  type EmbeddedAppRow = {
    id: string;
    job_id: string;
    stage_id: string;
    stage: { kind: string } | Array<{ kind: string }> | null;
    stage_entered_at: string | null;
    candidate_id: string;
  };
  const appsThisWeek = ((appsThisWeekRows ?? []) as EmbeddedAppRow[]).map(
    (row) => {
      const rel = row.stage;
      const stageRow = Array.isArray(rel) ? rel[0] ?? null : rel;
      return {
        id: row.id,
        job_id: row.job_id,
        // Surface kind as `status` so the downstream consumers (which
        // didn't care about per-DSO labels) keep reading a stable field.
        status: (stageRow?.kind ?? "open") as string,
        stage_entered_at: row.stage_entered_at,
        candidate_id: row.candidate_id,
      };
    }
  );

  // Hires this week — resolve hired-kind stage ids for the DSO and
  // filter on stage_id (head:true counts can't reliably embed-filter).
  const { data: hiredStageRows } = await admin
    .from("dso_pipeline_stages")
    .select("id")
    .eq("dso_id", dsoId)
    .eq("kind", "hired");
  const hiredStageIds = ((hiredStageRows ?? []) as Array<{ id: string }>).map(
    (r) => r.id
  );
  const hiresThisWeekCountResult =
    hiredStageIds.length > 0
      ? await admin
          .from("applications")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .in("stage_id", hiredStageIds)
          .gte("hired_at", since7)
      : { count: 0 };
  const hiresThisWeek = hiresThisWeekCountResult.count;

  // Top jobs by apps this week (max 5).
  const appsByJob = new Map<string, number>();
  for (const a of appsThisWeek) {
    appsByJob.set(a.job_id, (appsByJob.get(a.job_id) ?? 0) + 1);
  }
  const topJobs: WeeklyDigestTopJob[] = Array.from(appsByJob.entries())
    .map(([jobId, count]) => {
      const j = jobMap.get(jobId);
      return {
        title: j?.title ?? "(untitled)",
        apps_this_week: count,
        url: `${SITE_URL}/employer/jobs/${jobId}`,
      };
    })
    .sort((a, b) => b.apps_this_week - a.apps_this_week)
    .slice(0, 5);

  // Stale candidates: apps currently in a non-terminal stage with
  // stage_entered_at >14 days ago. Resolve open/screen/interview/offer
  // stage ids for the DSO and filter on stage_id.
  const { data: nonTerminalStageRows } = await admin
    .from("dso_pipeline_stages")
    .select("id, kind")
    .eq("dso_id", dsoId)
    .in("kind", ["open", "screen", "interview", "offer"]);
  const nonTerminalStageKindById = new Map<string, string>(
    ((nonTerminalStageRows ?? []) as Array<{ id: string; kind: string }>).map(
      (r) => [r.id, r.kind]
    )
  );
  const nonTerminalStageIds = Array.from(nonTerminalStageKindById.keys());

  const { data: staleRows } = nonTerminalStageIds.length
    ? await admin
        .from("applications")
        .select(
          "id, job_id, stage_id, stage_entered_at, candidates(full_name)"
        )
        .in("job_id", jobIds)
        .in("stage_id", nonTerminalStageIds)
        .lte("stage_entered_at", since14)
        .order("stage_entered_at", { ascending: true })
        .limit(5)
    : { data: [] };
  const stale: WeeklyDigestStaleCandidate[] = (
    (staleRows ?? []) as unknown as Array<{
      id: string;
      job_id: string;
      stage_id: string;
      stage_entered_at: string | null;
      candidates: Array<{ full_name: string | null }>;
    }>
  ).map((r) => {
    const cand = r.candidates?.[0];
    const job = jobMap.get(r.job_id);
    const enteredMs = r.stage_entered_at
      ? new Date(r.stage_entered_at).getTime()
      : now.getTime();
    const daysInStage = Math.max(
      0,
      Math.floor((now.getTime() - enteredMs) / (1000 * 60 * 60 * 24))
    );
    const kind = nonTerminalStageKindById.get(r.stage_id) ?? "open";
    return {
      name: cand?.full_name ?? "Candidate",
      job_title: job?.title ?? "—",
      stage_label: STAGE_LABEL[kind] ?? kind,
      days_in_stage: daysInStage,
      url: `${SITE_URL}/employer/applications/${r.id}`,
    };
  });

  // Skip emails when there's truly nothing to report.
  if (
    appsThisWeek.length === 0 &&
    (hiresThisWeek ?? 0) === 0 &&
    stale.length === 0
  ) {
    return null;
  }

  return {
    weekRangeLabel: weekRangeLabel(),
    applicationsThisWeek: appsThisWeek.length,
    applicationsLastWeek: appsLastWeek ?? 0,
    hiresThisWeek: hiresThisWeek ?? 0,
    openRoles: openRoles ?? 0,
    topJobs,
    staleCandidates: stale,
  };
}
