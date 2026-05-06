"use server";

/**
 * Privacy & Visibility server actions (Phase 4.3.d).
 *
 * Five distinct surfaces:
 *   • updateVisibility            — cv_visibility (3-state) + resume + contact
 *   • setHideFromCurrentEmployer  — bulk-flip auto_blocklisted on every
 *                                     work_history row marked is_current
 *   • updatePracticeFitConsent    — 3-state opt-in
 *   • addBlockedEmployer / removeBlockedEmployer — DSO block list
 *   • searchDsosForBlock          — typeahead lookup, max 20 results
 *
 * Block list cap of 100 enforced here (per locked R4). UI also enforces
 * client-side; this is the authoritative gate.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BLOCK_LIST_CAP = 100;

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
// Visibility — cv_visibility + resume + contact
// ─────────────────────────────────────────────────────────────────────

export interface VisibilityInput {
  cv_visibility: "hidden" | "recruiters_only" | "open_to_work";
  resume_visibility:
    | "public"
    | "verified_dso_only"
    | "after_apply"
    | "hidden";
  contact_info_visibility: "always" | "after_apply";
}

export async function updateVisibility(
  input: VisibilityInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      cv_visibility: input.cv_visibility,
      resume_visibility: input.resume_visibility,
      contact_info_visibility: input.contact_info_visibility,
    })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[settings/privacy] updateVisibility", error);
    return { ok: false, error: "Couldn't save visibility settings." };
  }
  revalidatePath("/candidate/settings/privacy");
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Hide from current employer — master toggle
//
// Bulk-updates `auto_blocklisted` on every work_history row where
// is_current = true. The per-row flag is the source of truth for
// downstream filters; this just exposes a global on/off in the UI.
// ─────────────────────────────────────────────────────────────────────

export async function setHideFromCurrentEmployer(
  enabled: boolean
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidate_work_history")
    .update({ auto_blocklisted: enabled })
    .eq("candidate_id", ctx.candidateId)
    .eq("is_current", true);

  if (error) {
    console.error("[settings/privacy] setHideFromCurrentEmployer", error);
    return { ok: false, error: "Couldn't update employer blocking." };
  }
  revalidatePath("/candidate/settings/privacy");
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Practice Fit consent
// ─────────────────────────────────────────────────────────────────────

export async function updatePracticeFitConsent(
  consent: "off" | "results_only" | "full"
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({ practice_fit_consent: consent })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[settings/privacy] updatePracticeFitConsent", error);
    return { ok: false, error: "Couldn't save Practice Fit consent." };
  }
  revalidatePath("/candidate/settings/privacy");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Block list
// ─────────────────────────────────────────────────────────────────────

export interface BlockedEmployer {
  id: string;
  dso_id: string;
  dso_name: string;
  dso_slug: string | null;
  reason_optional: string | null;
  created_at: string;
}

export async function addBlockedEmployer(
  dsoId: string,
  reason?: string
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  // Cap enforcement.
  const { count } = await ctx.supabase
    .from("candidate_blocked_employers")
    .select("*", { count: "exact", head: true })
    .eq("candidate_id", ctx.candidateId);

  if ((count ?? 0) >= BLOCK_LIST_CAP) {
    return {
      ok: false,
      error: `Block list is at the ${BLOCK_LIST_CAP}-DSO cap. Remove one to add another.`,
    };
  }

  const { error } = await ctx.supabase
    .from("candidate_blocked_employers")
    .insert({
      candidate_id: ctx.candidateId,
      dso_id: dsoId,
      reason_optional: reason?.trim() || null,
    });

  if (error) {
    // Unique-constraint violation = already blocked. Treat as success.
    if (error.code === "23505") {
      return { ok: true };
    }
    console.error("[settings/privacy] addBlockedEmployer", error);
    return { ok: false, error: "Couldn't add that DSO to your block list." };
  }
  revalidatePath("/candidate/settings/privacy");
  return { ok: true };
}

export async function removeBlockedEmployer(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidate_blocked_employers")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[settings/privacy] removeBlockedEmployer", error);
    return { ok: false, error: "Couldn't remove that DSO from your block list." };
  }
  revalidatePath("/candidate/settings/privacy");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Typeahead search of DSOs for the block-list adder
// ─────────────────────────────────────────────────────────────────────

export interface DsoSearchResult {
  id: string;
  name: string;
  slug: string | null;
  practice_count: number | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
}

export async function searchDsosForBlock(
  query: string
): Promise<{ ok: true; results: DsoSearchResult[] } | { ok: false; error: string }> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, results: [] };
  }

  // Pull active DSOs matching the query. ilike is fine at our scale.
  const { data, error } = await ctx.supabase
    .from("dsos")
    .select("id, name, slug, practice_count, headquarters_city, headquarters_state")
    .ilike("name", `%${trimmed}%`)
    .eq("status", "active")
    .order("name")
    .limit(20);

  if (error) {
    console.error("[settings/privacy] searchDsosForBlock", error);
    return { ok: false, error: "Couldn't search DSOs." };
  }

  return {
    ok: true,
    results:
      (data as DsoSearchResult[] | null)?.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        practice_count: d.practice_count,
        headquarters_city: d.headquarters_city,
        headquarters_state: d.headquarters_state,
      })) ?? [],
  };
}
