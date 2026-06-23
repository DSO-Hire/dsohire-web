"use server";

/**
 * /employer/settings/careers server actions.
 *
 * Per-job distribution opt-out. Flips jobs.distribution_enabled, which the
 * distribution source of truth (public.list_distribution_jobs) honors. Gated on
 * settings.manage (owner/admin) — RLS already restricts jobs.update to the DSO,
 * this shapes the error for the form and enforces the fine-grained capability.
 *
 * Confidential / internal_only jobs are excluded from distribution regardless,
 * so the UI locks their toggle; this action also refuses to flip them on as a
 * server-side backstop.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActingMember, memberBlockError } from "@/lib/permissions/guard";

export interface CareersActionState {
  ok: boolean;
  error?: string;
}

export async function setJobDistribution(
  jobId: string,
  enabled: boolean,
): Promise<CareersActionState> {
  if (!jobId) return { ok: false, error: "Missing job." };

  const supabase = await createSupabaseServerClient();
  const member = await getActingMember(supabase);
  const block = memberBlockError(member, "settings.manage");
  if (block || !member) return { ok: false, error: block ?? "Sign in required." };

  // Confirm the job belongs to this DSO and read its eligibility flags.
  const { data: job } = await supabase
    .from("jobs")
    .select("id, dso_id, confidential, visibility")
    .eq("id", jobId)
    .eq("dso_id", member.dsoId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Job not found." };

  // Backstop: a confidential / internal_only job can never distribute, so don't
  // let the toggle pretend otherwise.
  if (
    enabled &&
    ((job as { confidential?: boolean }).confidential === true ||
      (job as { visibility?: string }).visibility === "internal_only")
  ) {
    return {
      ok: false,
      error: "Confidential or internal-only jobs can't be distributed.",
    };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ distribution_enabled: enabled })
    .eq("id", jobId)
    .eq("dso_id", member.dsoId);
  if (error) return { ok: false, error: "Couldn't update distribution." };

  revalidatePath("/employer/settings/careers");
  return { ok: true };
}
