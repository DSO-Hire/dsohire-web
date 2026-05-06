"use server";

/**
 * Credentials tab server actions (Phase 4.3.e v1).
 *
 * Saved-search CRUD only in v1. License + certification expiry views
 * are read-only — no actions; the Settings page reads from existing
 * candidate_licenses + candidate_certifications tables and renders
 * the same data the profile editor writes to.
 *
 * CE tracking + file upload + state-requirements lookup are deferred.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
// Saved-search frequency update
// ─────────────────────────────────────────────────────────────────────

export async function updateSavedSearchFrequency(
  id: string,
  frequency: "instant" | "daily" | "weekly" | "off"
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidate_saved_searches")
    .update({ frequency })
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[settings/credentials] updateSavedSearchFrequency", error);
    return { ok: false, error: "Couldn't update alert frequency." };
  }
  revalidatePath("/candidate/settings/credentials");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Rename a saved search
// ─────────────────────────────────────────────────────────────────────

export async function renameSavedSearch(
  id: string,
  name: string
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };
  if (trimmed.length > 80)
    return { ok: false, error: "Name is too long (80 char max)." };

  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidate_saved_searches")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[settings/credentials] renameSavedSearch", error);
    return { ok: false, error: "Couldn't rename." };
  }
  revalidatePath("/candidate/settings/credentials");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Delete a saved search
// ─────────────────────────────────────────────────────────────────────

export async function deleteSavedSearch(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidate_saved_searches")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[settings/credentials] deleteSavedSearch", error);
    return { ok: false, error: "Couldn't delete that saved search." };
  }
  revalidatePath("/candidate/settings/credentials");
  return { ok: true };
}
