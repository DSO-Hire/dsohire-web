"use server";

/**
 * Per-application affiliation reveal — the "Reveal DSO" action that flips
 * applications.affiliation_revealed = true (Phase 4.5.b launch-blocker,
 * locked 2026-05-08).
 *
 * Only meaningful when the DSO's affiliation_reveal_policy = 'per_application'.
 * Exposes a server action that:
 *   1. Verifies the caller has access to the application's job (via the
 *      existing user_can_access_job helper — owner/admin/recruiter or HM
 *      scoped to a relevant location).
 *   2. Verifies the DSO's policy is 'per_application' (otherwise the
 *      reveal action is a no-op since the policy controls visibility
 *      another way).
 *   3. Stamps the audit columns: affiliation_revealed_at = now(),
 *      affiliation_revealed_by_dso_user_id = caller's dso_users.id.
 *   4. Flips the bit one-way — once true, the helper has no path back to
 *      false (intentionally; the candidate already saw the corporate
 *      name, "un-revealing" would be misleading).
 *
 * The audit log integration with Phase 4.5.e (audit_events) lands when
 * that table ships; for now the in-row audit columns are sufficient.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RevealResult {
  ok: boolean;
  alreadyRevealed?: boolean;
  error?: string;
}

export async function revealDsoToCandidate(
  applicationId: string
): Promise<RevealResult> {
  if (!applicationId) {
    return { ok: false, error: "Missing application id." };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  // Caller's dso_users row — needed for the audit stamp + the policy
  // check below.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership." };

  // Pull the application + its DSO's policy. RLS already restricts this
  // SELECT to applications the caller can access (via
  // user_can_access_job), so a denial here is a permission failure.
  const { data: app } = await supabase
    .from("applications")
    .select("id, job_id, affiliation_revealed, jobs!inner(dso_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) {
    return { ok: false, error: "Application not found or out of scope." };
  }

  // Defense in depth: the application must belong to the caller's DSO.
  // user_can_access_job already enforces this for HMs by checking
  // job_locations intersection; this guard catches the case where a
  // misconfigured RLS rule lets a cross-DSO read through.
  type AppRow = {
    id: string;
    job_id: string;
    affiliation_revealed: boolean;
    jobs: { dso_id: string };
  };
  const appTyped = app as unknown as AppRow;
  if (appTyped.jobs.dso_id !== dsoUser.dso_id) {
    return { ok: false, error: "Cross-DSO access denied." };
  }

  // Already revealed → idempotent no-op. Surfaces an `alreadyRevealed`
  // flag so the UI can toast "already shared" rather than "saved!"
  if (appTyped.affiliation_revealed) {
    return { ok: true, alreadyRevealed: true };
  }

  // Verify the DSO's policy is 'per_application' before flipping. Other
  // policies make this action a no-op — for 'never' the bit doesn't
  // matter (helper ignores it), for 'after_hire' the bit isn't the
  // gate (status is). Refuse rather than silently flipping; the UI
  // shouldn't have surfaced the button in the first place.
  const { data: dso } = await supabase
    .from("dsos")
    .select("affiliation_reveal_policy")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();
  if (!dso) return { ok: false, error: "DSO context lost." };
  if ((dso.affiliation_reveal_policy as string) !== "per_application") {
    return {
      ok: false,
      error:
        "Per-application reveal is only available when the DSO's reveal policy is set to 'Per application'. Update the policy in Settings → Profile first.",
    };
  }

  // Flip + stamp audit columns
  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      affiliation_revealed: true,
      affiliation_revealed_at: new Date().toISOString(),
      affiliation_revealed_by_dso_user_id: dsoUser.id,
    })
    .eq("id", applicationId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // Revalidate the candidate-facing surfaces so the next render shows
  // the corporate name. Employer side never showed the practice name,
  // so no employer-side path needs invalidation.
  revalidatePath(`/employer/applications/${applicationId}`);
  revalidatePath(`/candidate/applications/${applicationId}`);

  return { ok: true };
}
