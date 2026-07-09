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
import {
  sanitizeSavedSearchFilters,
  describeSavedSearchFilters,
  type SavedSearchFilters,
} from "@/lib/jobs/saved-search-filters";

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
// Create a saved search (the /jobs "Save this search" CTA)
// ─────────────────────────────────────────────────────────────────────

export type CreateSavedSearchResult =
  | { ok: true; id: string; name: string; existed: boolean }
  | { ok: false; error: string };

/**
 * Insert a saved search for the current candidate from the /jobs CTA.
 * Idempotent on filter_state: saving the exact same filters again returns
 * the existing row instead of stacking duplicates (the post-sign-up
 * auto-save flow can fire more than once on refresh).
 */
export async function createSavedSearch(
  filters: SavedSearchFilters,
  frequency: "instant" | "daily" | "weekly" | "off" = "daily"
): Promise<CreateSavedSearchResult> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const clean = sanitizeSavedSearchFilters(filters);
  const name = describeSavedSearchFilters(clean).slice(0, 80);

  // Dupe check in JS with key-sorted stringify — jsonb doesn't preserve key
  // order, so a raw equality filter on the column isn't reliable across the
  // serialize/store/read round-trip.
  const { data: rows } = await ctx.supabase
    .from("candidate_saved_searches")
    .select("id, name, filter_state")
    .eq("candidate_id", ctx.candidateId);
  const canonical = (v: unknown): string =>
    JSON.stringify(v, (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
        : val
    );
  const dupe = (rows ?? []).find(
    (r) => canonical(r.filter_state ?? {}) === canonical(clean)
  );
  if (dupe) {
    return { ok: true, id: dupe.id as string, name: dupe.name as string, existed: true };
  }

  const { data: inserted, error } = await ctx.supabase
    .from("candidate_saved_searches")
    .insert({
      candidate_id: ctx.candidateId,
      name,
      filter_state: clean,
      frequency,
    })
    .select("id, name")
    .single();

  if (error || !inserted) {
    console.error("[settings/credentials] createSavedSearch", error);
    return { ok: false, error: "Couldn't save this search." };
  }
  revalidatePath("/candidate/settings/credentials");
  return {
    ok: true,
    id: inserted.id as string,
    name: inserted.name as string,
    existed: false,
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
