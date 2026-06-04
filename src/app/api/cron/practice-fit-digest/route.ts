/**
 * /api/cron/practice-fit-digest — the weekly PracticeFit drip (Phase B.2).
 *
 * Schedule: every Monday 14:00 UTC (9am ET / 8am CT), triggered by a GitHub
 * Action (.github/workflows/practice-fit-digest.yml). It runs from GH Actions
 * rather than vercel.json because the Hobby tier caps cron *entries* (we're
 * already at the limit there) — same pattern as interview-reminders /
 * job-lifecycle / automation-*.
 *
 * For each consenting candidate (practice_fit_consent ∈ {results_only, full}):
 *   1. Score the most recent open jobs against their PracticeFit, reusing
 *      getTopFitJobsForCandidate with the SERVICE-ROLE client (the candidate's
 *      private rows are RLS-gated to their own session, which a cron lacks).
 *   2. decideDigest() chooses: top-5 NEW high-fit roles → "new"; nothing new but
 *      >30 days silent → "fallback" (broader roles); otherwise skip.
 *   3. Send via dispatchNotification (pref-gating + one-click unsubscribe header
 *      + dispatch log), then record a practice_fit_digest_sends row for dedup.
 *
 * Privacy: DSO names are masked upstream by getTopFitJobsForCandidate
 * (getDisplayedDsoNamesBatch, viewer "public") — candidate-facing mail never
 * carries a raw corporate name.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}. Reject anything without it.
 *
 * Safe-testing query params (all optional):
 *   • ?dryRun=1                 — evaluate + report, send NOTHING, record NOTHING.
 *   • ?onlyEmail=you@gmail.com  — restrict the real send to a single recipient
 *                                 (use a Gmail; never an @dsohire.com address —
 *                                 Proofpoint eats own-domain app mail).
 *   • ?limit=N                  — cap candidates processed this run.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  getTopFitJobsForCandidate,
  type RoleThatFits,
} from "@/lib/practice-fit/roles-that-fit";
import { decideDigest } from "@/lib/practice-fit/digest-selection";
import { BUCKET_STYLES } from "@/lib/practice-fit/buckets";
import {
  PracticeFitDigest,
  type PracticeFitDigestJob,
} from "@/emails/candidate/PracticeFitDigest";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { unsubscribePageUrlForEvent } from "@/lib/notifications/unsubscribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

/** Ranked fits to pull per candidate — ≥ 5 to fill a digest with dedup headroom. */
const POOL_LIMIT = 12;
/** Window for gathering previously-sent job ids (dedup). */
const SENT_HISTORY_DAYS = 90;
/** Safety cap on candidates per run (overridable via ?limit). */
const DEFAULT_CANDIDATE_CAP = 500;

interface DigestRunReport {
  dry_run: boolean;
  candidates_evaluated: number;
  sent_new: number;
  sent_fallback: number;
  skipped_no_new: number;
  skipped_opted_out: number;
  skipped_no_email: number;
  emails_failed: number;
  errors: string[];
}

interface CandidateRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  first_name: string | null;
  full_name: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const onlyEmail = url.searchParams.get("onlyEmail");
  const limitParam = Number(url.searchParams.get("limit"));
  const candidateCap =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : DEFAULT_CANDIDATE_CAP;

  const admin = createSupabaseServiceRoleClient();
  const now = new Date();
  const report: DigestRunReport = {
    dry_run: dryRun,
    candidates_evaluated: 0,
    sent_new: 0,
    sent_fallback: 0,
    skipped_no_new: 0,
    skipped_opted_out: 0,
    skipped_no_email: 0,
    emails_failed: 0,
    errors: [],
  };

  // 1. Consenting candidates (PracticeFit on), not soft-deleted, with an auth id.
  const { data: candRows, error: candErr } = await admin
    .from("candidates")
    .select("id, auth_user_id, email, first_name, full_name")
    .in("practice_fit_consent", ["results_only", "full"])
    .is("deleted_at", null)
    .not("auth_user_id", "is", null);
  if (candErr) {
    return NextResponse.json(
      { error: "candidate query failed", detail: candErr.message },
      { status: 500 }
    );
  }
  const candidates = (candRows ?? []) as CandidateRow[];

  // 2. Pre-filter recipients who turned this stream off (one-click unsubscribe
  //    or settings toggle). The dispatcher would suppress them anyway, but
  //    skipping here avoids the (expensive) scoring pass for opted-out users.
  const userIds = candidates.map((c) => c.auth_user_id);
  const optedOut = new Set<string>();
  if (userIds.length > 0) {
    const { data: optRows } = await admin
      .from("notification_preferences")
      .select("user_id")
      .eq("event_kind", "candidate.practice_fit_digest")
      .eq("channel", "email")
      .eq("enabled", false)
      .in("user_id", userIds);
    for (const r of (optRows ?? []) as Array<{ user_id: string }>) {
      optedOut.add(r.user_id);
    }
  }

  // 3. Per-candidate evaluation.
  let processed = 0;
  for (const c of candidates) {
    if (processed >= candidateCap) break;

    const email = c.email?.trim() || null;
    // onlyEmail restricts the run to one recipient WITHOUT counting the rest as
    // evaluated (keeps the test report clean).
    if (onlyEmail && email !== onlyEmail) continue;

    processed += 1;
    report.candidates_evaluated += 1;

    if (!email) {
      report.skipped_no_email += 1;
      continue;
    }
    if (optedOut.has(c.auth_user_id)) {
      report.skipped_opted_out += 1;
      continue;
    }

    try {
      // Score (service-role so the candidate's private rows are visible).
      const fits = await getTopFitJobsForCandidate(c.id, POOL_LIMIT, admin);

      // Send history for dedup + cadence.
      const sinceIso = new Date(
        now.getTime() - SENT_HISTORY_DAYS * 86_400_000
      ).toISOString();
      const { data: sends } = await admin
        .from("practice_fit_digest_sends")
        .select("job_ids, sent_at")
        .eq("candidate_id", c.id)
        .gte("sent_at", sinceIso)
        .order("sent_at", { ascending: false });

      const previouslySent = new Set<string>();
      let lastSentAt: Date | null = null;
      for (const s of (sends ?? []) as Array<{
        job_ids: string[] | null;
        sent_at: string;
      }>) {
        if (lastSentAt === null) lastSentAt = new Date(s.sent_at);
        for (const jid of s.job_ids ?? []) previouslySent.add(jid);
      }

      const decision = decideDigest({
        fits,
        previouslySentJobIds: previouslySent,
        lastSentAt,
        now,
      });

      if (decision.variant === "skip") {
        report.skipped_no_new += 1;
        continue;
      }

      if (dryRun) {
        if (decision.variant === "new") report.sent_new += 1;
        else report.sent_fallback += 1;
        continue;
      }

      const jobsForEmail: PracticeFitDigestJob[] = decision.jobs.map((j) => ({
        title: j.title,
        dso_name: j.dso_name,
        location_label: firstLocationLabel(j.locations),
        bucket_label: BUCKET_STYLES[j.fit.bucket].label,
        url: `${SITE_URL}/jobs/${j.job_id}`,
      }));

      const firstName =
        c.first_name?.trim() ||
        c.full_name?.trim().split(/\s+/)[0] ||
        "there";

      const subject =
        decision.variant === "new"
          ? `${decision.jobs.length} new role${
              decision.jobs.length === 1 ? "" : "s"
            } that fit you · PracticeFit`
          : "Roles worth a look this week · PracticeFit";

      const unsubscribeUrl =
        unsubscribePageUrlForEvent(
          c.auth_user_id,
          "candidate.practice_fit_digest"
        ) ?? undefined;

      const result = await dispatchNotification({
        userId: c.auth_user_id,
        eventKind: "candidate.practice_fit_digest",
        email: {
          to: email,
          subject,
          react: PracticeFitDigest({
            recipientFirstName: firstName,
            variant: decision.variant,
            jobs: jobsForEmail,
            matchesUrl: `${SITE_URL}/candidate/dashboard`,
            unsubscribeUrl,
          }),
        },
        relatedCandidateId: c.id,
      });

      if (result.status === "sent") {
        // Record the send for dedup + cadence (only on an actual send).
        const { error: insErr } = await admin
          .from("practice_fit_digest_sends")
          .insert({
            candidate_id: c.id,
            kind: decision.variant,
            job_ids: decision.jobs.map((j) => j.job_id),
          });
        if (insErr) {
          report.errors.push(
            `send-log-insert cand=${c.id}: ${insErr.message}`
          );
        }
        if (decision.variant === "new") report.sent_new += 1;
        else report.sent_fallback += 1;
      } else if (result.status.startsWith("suppressed")) {
        report.skipped_opted_out += 1;
      } else {
        report.emails_failed += 1;
        report.errors.push(
          `dispatch cand=${c.id}: ${result.reason ?? result.status}`
        );
      }
    } catch (err) {
      report.emails_failed += 1;
      report.errors.push(
        `cand=${c.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json(report);
}

function firstLocationLabel(
  locations: RoleThatFits["locations"]
): string | null {
  for (const loc of locations) {
    const city = loc.city?.trim() || null;
    const state = loc.state?.trim() || null;
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
  }
  return null;
}
