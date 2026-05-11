"use server";

/**
 * Talent Pool server actions (E7.1 / Phase 5D, shipped 2026-05-11).
 *
 * saveCandidateToPool / removeCandidateFromPool / updatePoolEntry.
 * RLS gates writes to recruiter+, so the actions only need to handle
 * the happy/error paths and shape the result for the UI. Audit log
 * records every save + removal so the team page (Phase 4.5.e) can see
 * who's been sourcing.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";

export interface TalentPoolResult {
  ok: boolean;
  error?: string;
  entryId?: string;
}

export async function saveCandidateToPool(
  candidateId: string,
  opts?: { notes?: string; tags?: string[] }
): Promise<TalentPoolResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };

  // Verify candidate is discoverable (defense-in-depth — RLS gates
  // the candidate read separately, but a clear error here is friendlier
  // than a silent failure).
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, cv_visibility, is_guest, deleted_at")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) {
    return { ok: false, error: "Candidate not found or not discoverable." };
  }

  // Upsert against the unique(dso_id, candidate_id) constraint.
  const { data: existing } = await supabase
    .from("dso_talent_pool_entries")
    .select("id")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (existing) {
    // Already saved — update notes/tags if provided, no-op otherwise.
    if (opts?.notes !== undefined || opts?.tags !== undefined) {
      const patch: Record<string, unknown> = {};
      if (opts.notes !== undefined) patch.notes = opts.notes || null;
      if (opts.tags !== undefined) patch.tags = opts.tags.length > 0 ? opts.tags : null;
      const { error } = await supabase
        .from("dso_talent_pool_entries")
        .update(patch)
        .eq("id", existing.id as string);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/employer/talent-pool");
    return { ok: true, entryId: existing.id as string };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("dso_talent_pool_entries")
    .insert({
      dso_id: dsoUser.dso_id as string,
      candidate_id: candidateId,
      added_by: dsoUser.id as string,
      notes: opts?.notes || null,
      tags: opts?.tags && opts.tags.length > 0 ? opts.tags : null,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "Couldn't save." };
  }

  await recordAuditEvent({
    dsoId: dsoUser.dso_id as string,
    actorUserId: user.id,
    actorDsoUserId: dsoUser.id as string,
    actorName: (dsoUser.full_name as string | null) ?? null,
    actorRole: (dsoUser.role as string | null) ?? null,
    eventKind: "talent_pool.saved",
    targetTable: "candidates",
    targetId: candidateId,
    summary: `Saved ${(candidate.full_name as string | null) ?? "a candidate"} to the talent pool`,
    metadata: {
      candidate_id: candidateId,
      entry_id: inserted.id,
    },
  });

  revalidatePath("/employer/talent-pool");
  return { ok: true, entryId: inserted.id as string };
}

export async function removeCandidateFromPool(
  entryId: string
): Promise<TalentPoolResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Snapshot for audit before delete.
  const { data: entry } = await supabase
    .from("dso_talent_pool_entries")
    .select("id, dso_id, candidate_id, candidates(full_name)")
    .eq("id", entryId)
    .maybeSingle();

  const { error: delErr, data: deleted } = await supabase
    .from("dso_talent_pool_entries")
    .delete()
    .eq("id", entryId)
    .select("id");
  if (delErr) return { ok: false, error: delErr.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  if (entry) {
    // candidates is the joined array via !inner-like behavior on the
    // implicit FK select — defensively handle both array and object.
    const candName =
      (
        (entry as unknown as {
          candidates?: Array<{ full_name: string | null }> | { full_name: string | null };
        }).candidates as unknown
      );
    let displayName: string | null = null;
    if (Array.isArray(candName)) {
      displayName =
        (candName[0] as { full_name: string | null } | undefined)?.full_name ?? null;
    } else if (candName && typeof candName === "object") {
      displayName =
        (candName as { full_name: string | null }).full_name ?? null;
    }
    await recordAuditEvent({
      dsoId: entry.dso_id as string,
      actorUserId: user.id,
      eventKind: "talent_pool.removed",
      targetTable: "candidates",
      targetId: entry.candidate_id as string,
      summary: `Removed ${displayName ?? "a candidate"} from the talent pool`,
      metadata: {
        entry_id: entryId,
        candidate_id: entry.candidate_id,
      },
    });
  }

  revalidatePath("/employer/talent-pool");
  return { ok: true };
}

export async function updatePoolEntry(
  entryId: string,
  patch: { notes?: string | null; tags?: string[] | null }
): Promise<TalentPoolResult> {
  const supabase = await createSupabaseServerClient();
  const update: Record<string, unknown> = {};
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.tags !== undefined) {
    update.tags = patch.tags && patch.tags.length > 0 ? patch.tags : null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error, data } = await supabase
    .from("dso_talent_pool_entries")
    .update(update)
    .eq("id", entryId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }
  revalidatePath("/employer/talent-pool");
  return { ok: true };
}
