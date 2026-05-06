"use server";

/**
 * Data & Account server actions (Phase 4.3.f).
 *
 * Two main actions:
 *   • exportMyData — pulls every candidate-owned row from every relevant
 *     table and returns a JSON blob. v1 generates synchronously and
 *     returns; the async-via-email path with 24h availability is a
 *     follow-up that doesn't change the API shape.
 *   • softDeleteAccount — sets candidates.deleted_at, signs the user out
 *     globally, returns success. A future cron hard-deletes 30 days
 *     after deleted_at.
 *
 * The "withdraw applications" link is a static deep-link, no action
 * needed here — clicking it on the page navigates to the existing
 * /candidate/applications surface.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

const SOFT_DELETE_GRACE_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ExportPayload {
  exported_at: string;
  exported_by: string;
  format_version: 1;
  candidate: Record<string, unknown> | null;
  work_history: unknown[];
  education: unknown[];
  licenses: unknown[];
  certifications: unknown[];
  applications: unknown[];
  notification_preferences: unknown[];
  blocked_employers: unknown[];
  notes: string;
}

export type ExportResult =
  | { ok: true; payload: ExportPayload }
  | { ok: false; error: string };

export type DeleteAccountResult =
  | { ok: true; deletedAt: string; hardDeleteOn: string }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────

export async function exportMyData(): Promise<ExportResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) {
    return { ok: false, error: "Candidate record missing." };
  }
  const candidateId = candidate.id as string;

  // Pull every owned table in parallel. RLS would block cross-candidate
  // reads anyway, so this is also a good correctness check.
  const [
    workHistory,
    education,
    licenses,
    certifications,
    applications,
    notificationPrefs,
    blockedEmployers,
  ] = await Promise.all([
    supabase
      .from("candidate_work_history")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
    supabase
      .from("candidate_education")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
    supabase
      .from("candidate_licenses")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
    supabase
      .from("candidate_certifications")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
    supabase
      .from("applications")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .then((r) => r.data ?? []),
    supabase
      .from("candidate_blocked_employers")
      .select("*, dsos:dsos(name, slug)")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
  ]);

  return {
    ok: true,
    payload: {
      exported_at: new Date().toISOString(),
      exported_by: user.email ?? user.id,
      format_version: 1,
      candidate: candidate as Record<string, unknown>,
      work_history: workHistory,
      education,
      licenses,
      certifications,
      applications,
      notification_preferences: notificationPrefs,
      blocked_employers: blockedEmployers,
      notes:
        "This export contains every row tied to your DSO Hire account that we can " +
        "share without exposing other users. Application screening answers + employer " +
        "comments authored about your application are excluded for the privacy of the " +
        "DSO. Email cam@dsohire.com if you need a more comprehensive export.",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Soft-delete account
// ─────────────────────────────────────────────────────────────────────

export async function softDeleteAccount(
  confirmation: string
): Promise<DeleteAccountResult> {
  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return {
      ok: false,
      error: "Please type DELETE to confirm.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const now = new Date();
  const { error } = await supabase
    .from("candidates")
    .update({ deleted_at: now.toISOString() })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[settings/data] softDeleteAccount", error);
    return {
      ok: false,
      error: "Couldn't schedule deletion. Email cam@dsohire.com if this persists.",
    };
  }

  // Sign the user out so the next request clears their session.
  await supabase.auth.signOut();

  const hardDeleteOn = new Date(
    now.getTime() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000
  );
  return {
    ok: true,
    deletedAt: now.toISOString(),
    hardDeleteOn: hardDeleteOn.toISOString(),
  };
}
