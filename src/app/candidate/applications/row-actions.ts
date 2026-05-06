"use server";

/**
 * Per-row actions on /candidate/applications (Phase 4.4 row actions).
 *
 * Three actions:
 *   • withdrawApplication   — sets status='withdrawn' + withdrawn_at,
 *                              writes optional reason chips + textarea
 *                              to application_withdraw_reasons (private
 *                              to candidate — employer never sees).
 *                              Posts a system status_event so the
 *                              employer's kanban + activity timeline
 *                              shows "Candidate withdrew."
 *   • updateSelfReportedStatus — sets self_reported_status. The
 *                              employer-truth `status` column is
 *                              untouched. Candidate sees their
 *                              self-reported tag everywhere; employer
 *                              sees their own truth.
 *   • toggleHideApplication — toggles applications.hidden_at. Hidden
 *                              applications still exist for the
 *                              employer; they're just suppressed from
 *                              the candidate's All / Active / Interview
 *                              / Offer / Closed tabs and surface
 *                              under Hidden.
 *
 * The 30-day re-apply cooldown is enforced in /jobs/[id]/apply/actions.ts
 * (the apply action), not here — that's where the cooldown matters.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/applications/stages";

type Result =
  | { ok: true }
  | { ok: false; error: string };

async function getCandidateContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return { ok: false as const, error: "Candidate record missing." };
  }
  return {
    ok: true as const,
    supabase,
    candidateId: candidate.id as string,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Withdraw
// ─────────────────────────────────────────────────────────────────────

export const WITHDRAW_REASON_CHIPS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "found_another_role", label: "Found another role" },
  { value: "compensation_low", label: "Pay didn't meet expectations" },
  { value: "location_mismatch", label: "Location didn't work" },
  { value: "process_too_slow", label: "Process took too long" },
  { value: "no_response", label: "Heard nothing back" },
  { value: "exploring", label: "Just exploring" },
  { value: "other", label: "Other" },
];

export async function withdrawApplication(input: {
  applicationId: string;
  reasonChips: string[];
  reasonText?: string;
}): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  // Authorization: confirm the application belongs to this candidate
  // before any mutation. RLS already enforces this server-side, but
  // returning a clean error message is friendlier than the RLS denial.
  const { data: existing } = await ctx.supabase
    .from("applications")
    .select("id, status")
    .eq("id", input.applicationId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "Application not found." };
  }
  if (existing.status === "withdrawn") {
    return { ok: false, error: "This application is already withdrawn." };
  }

  const now = new Date().toISOString();

  // 1. Flip status + withdrawn_at on the application row.
  const { error: updateError } = await ctx.supabase
    .from("applications")
    .update({
      status: "withdrawn" as ApplicationStatus,
      withdrawn_at: now,
    })
    .eq("id", input.applicationId)
    .eq("candidate_id", ctx.candidateId);

  if (updateError) {
    console.error("[withdrawApplication] update failed", updateError);
    return { ok: false, error: "Couldn't withdraw the application." };
  }

  // 2. Persist the candidate's reasons (private — employer never sees).
  // Upsert in case the candidate withdrew, un-withdrew somehow, and
  // re-withdrew.
  const filteredChips = input.reasonChips
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const { error: reasonError } = await ctx.supabase
    .from("application_withdraw_reasons")
    .upsert(
      {
        application_id: input.applicationId,
        reason_chips: filteredChips,
        reason_text: input.reasonText?.trim() || null,
      },
      { onConflict: "application_id" }
    );
  if (reasonError) {
    // The status flip is the main thing — log + continue rather than fail.
    console.warn("[withdrawApplication] reason write failed", reasonError);
  }

  revalidatePath("/candidate/applications");
  revalidatePath(`/candidate/applications/${input.applicationId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Self-reported status
// ─────────────────────────────────────────────────────────────────────

export type SelfReportedStatus =
  | "interviewing"
  | "offer_received"
  | "hired"
  | "no_longer_interested";

export const SELF_REPORTED_OPTIONS: ReadonlyArray<{
  value: SelfReportedStatus | null;
  label: string;
}> = [
  { value: null, label: "Clear my self-reported status" },
  { value: "interviewing", label: "I'm interviewing" },
  { value: "offer_received", label: "I received an offer" },
  { value: "hired", label: "I was hired" },
  { value: "no_longer_interested", label: "I'm no longer interested" },
];

export async function updateSelfReportedStatus(input: {
  applicationId: string;
  status: SelfReportedStatus | null;
}): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("applications")
    .update({ self_reported_status: input.status })
    .eq("id", input.applicationId)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[updateSelfReportedStatus] failed", error);
    return { ok: false, error: "Couldn't update your self-reported status." };
  }

  revalidatePath("/candidate/applications");
  revalidatePath(`/candidate/applications/${input.applicationId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Hide / unhide
// ─────────────────────────────────────────────────────────────────────

export async function toggleHideApplication(input: {
  applicationId: string;
  hide: boolean;
}): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("applications")
    .update({ hidden_at: input.hide ? new Date().toISOString() : null })
    .eq("id", input.applicationId)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[toggleHideApplication] failed", error);
    return {
      ok: false,
      error: input.hide
        ? "Couldn't hide that application."
        : "Couldn't restore that application.",
    };
  }

  revalidatePath("/candidate/applications");
  return { ok: true };
}
