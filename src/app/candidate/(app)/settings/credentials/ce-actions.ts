"use server";

/**
 * CE certificate server actions (Phase 4.3.e).
 *
 * Six actions:
 *   • addCeEntry          — create a CE row (optionally with file upload)
 *   • updateCeEntry       — edit an existing CE row
 *   • deleteCeEntry       — delete a CE row + its storage object
 *   • uploadCeFile        — multipart file upload to ce_certificates bucket
 *   • replaceCeFile       — swap the file on an existing CE row
 *   • removeCeFile        — clear file_path + delete the storage object
 *
 * Caps:
 *   • 50 CE rows per candidate (enforced before insert)
 *   • 10MB per file (enforced by storage bucket; we double-check via size)
 *
 * RLS guarantees the candidate can only mutate their own rows.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CE_FILE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CE_ROWS = 50;

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function getAuthedCandidate() {
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
    return { ok: false as const, error: "Candidate profile not found." };
  }
  return {
    ok: true as const,
    supabase,
    user,
    candidateId: candidate.id as string,
  };
}

function revalidate() {
  revalidatePath("/candidate/settings/credentials");
}

/* ──────────────────────────────────────────────────────────────
 * Validation
 * ─────────────────────────────────────────────────────────── */

function validateInput(input: CeInput): { ok: true } | { ok: false; error: string } {
  if (!input.course_name || input.course_name.trim().length === 0) {
    return { ok: false, error: "Course name is required." };
  }
  if (input.course_name.length > 200) {
    return { ok: false, error: "Course name is too long." };
  }
  if (
    !Number.isFinite(input.hours_credit) ||
    input.hours_credit <= 0 ||
    input.hours_credit > 100
  ) {
    return {
      ok: false,
      error: "CE hours must be a positive number under 100.",
    };
  }
  if (
    input.completion_date == null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.completion_date)
  ) {
    return {
      ok: false,
      error: "Completion date is required (YYYY-MM-DD).",
    };
  }
  return { ok: true };
}

export interface CeInput {
  course_name: string;
  provider: string | null;
  hours_credit: number;
  category: string | null;
  completion_date: string; // YYYY-MM-DD
  license_type: string | null;
}

/* ──────────────────────────────────────────────────────────────
 * Add
 * ─────────────────────────────────────────────────────────── */

export async function addCeEntry(input: CeInput): Promise<Result<{ id: string }>> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const v = validateInput(input);
  if (!v.ok) return v;

  // Cap check: stop at 50 CE rows per candidate.
  const { count } = await ctx.supabase
    .from("ce_certificates")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", ctx.candidateId);

  if ((count ?? 0) >= MAX_CE_ROWS) {
    return {
      ok: false,
      error: `You're at the ${MAX_CE_ROWS}-CE cap. Delete an old entry to add another.`,
    };
  }

  const { data, error } = await ctx.supabase
    .from("ce_certificates")
    .insert({
      candidate_id: ctx.candidateId,
      course_name: input.course_name.trim(),
      provider: input.provider?.trim() || null,
      hours_credit: input.hours_credit,
      category: input.category?.trim() || null,
      completion_date: input.completion_date,
      license_type: input.license_type?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ce] addCeEntry", error);
    return { ok: false, error: "Couldn't save the CE entry." };
  }
  revalidate();
  return { ok: true, id: data.id as string };
}

/* ──────────────────────────────────────────────────────────────
 * Update
 * ─────────────────────────────────────────────────────────── */

export async function updateCeEntry(
  id: string,
  input: CeInput
): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const v = validateInput(input);
  if (!v.ok) return v;

  const { error } = await ctx.supabase
    .from("ce_certificates")
    .update({
      course_name: input.course_name.trim(),
      provider: input.provider?.trim() || null,
      hours_credit: input.hours_credit,
      category: input.category?.trim() || null,
      completion_date: input.completion_date,
      license_type: input.license_type?.trim() || null,
    })
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[ce] updateCeEntry", error);
    return { ok: false, error: "Couldn't update the CE entry." };
  }
  revalidate();
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Delete
 * ─────────────────────────────────────────────────────────── */

export async function deleteCeEntry(id: string): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  // Look up file_path so we can also delete the storage object.
  const { data: row } = await ctx.supabase
    .from("ce_certificates")
    .select("file_path")
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();

  if (row?.file_path) {
    const path = (row as Record<string, unknown>).file_path as string;
    await ctx.supabase.storage.from("ce_certificates").remove([path]);
  }

  const { error } = await ctx.supabase
    .from("ce_certificates")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[ce] deleteCeEntry", error);
    return { ok: false, error: "Couldn't delete the CE entry." };
  }
  revalidate();
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * File upload
 *
 * The file is sent as multipart FormData in a single round trip with the
 * CE row id. We re-read the row after upload so the path + size are on
 * the row, not just inferred from the upload result.
 * ─────────────────────────────────────────────────────────── */

export async function uploadCeFile(
  ceId: string,
  formData: FormData
): Promise<Result<{ filePath: string }>> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }
  if (!CE_FILE_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Only PDF, PNG, JPEG, or WebP files are allowed.",
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File is over the 10MB cap." };
  }

  // Verify the CE row belongs to the candidate before writing storage.
  const { data: ceRow } = await ctx.supabase
    .from("ce_certificates")
    .select("id, file_path")
    .eq("id", ceId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!ceRow) {
    return { ok: false, error: "CE entry not found." };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${ctx.user.id}/${ceId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await ctx.supabase.storage
    .from("ce_certificates")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[ce] uploadCeFile storage", uploadError);
    return { ok: false, error: "Couldn't upload the file." };
  }

  // If the row already had a file, delete the old one to keep the bucket lean.
  const oldPath = (ceRow as Record<string, unknown>).file_path as
    | string
    | null;
  if (oldPath) {
    await ctx.supabase.storage.from("ce_certificates").remove([oldPath]);
  }

  const { error: rowError } = await ctx.supabase
    .from("ce_certificates")
    .update({ file_path: path, file_size_bytes: file.size })
    .eq("id", ceId)
    .eq("candidate_id", ctx.candidateId);
  if (rowError) {
    console.error("[ce] uploadCeFile row", rowError);
    // Best-effort cleanup of the orphan upload.
    await ctx.supabase.storage.from("ce_certificates").remove([path]);
    return { ok: false, error: "Couldn't link the file to your CE entry." };
  }

  revalidate();
  return { ok: true, filePath: path };
}

/* ──────────────────────────────────────────────────────────────
 * Remove file (keep the CE row, drop the attachment)
 * ─────────────────────────────────────────────────────────── */

export async function removeCeFile(ceId: string): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const { data: row } = await ctx.supabase
    .from("ce_certificates")
    .select("file_path")
    .eq("id", ceId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!row) return { ok: false, error: "CE entry not found." };

  const path = (row as Record<string, unknown>).file_path as string | null;
  if (path) {
    await ctx.supabase.storage.from("ce_certificates").remove([path]);
  }

  const { error } = await ctx.supabase
    .from("ce_certificates")
    .update({ file_path: null, file_size_bytes: null })
    .eq("id", ceId)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[ce] removeCeFile", error);
    return { ok: false, error: "Couldn't clear the file." };
  }
  revalidate();
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Signed URL
 *
 * The bucket is private — direct file_path links don't work. Use this to
 * mint a short-lived signed URL when the candidate clicks "View" or
 * "Download" on a CE row.
 * ─────────────────────────────────────────────────────────── */

export async function getCeFileSignedUrl(
  ceId: string
): Promise<Result<{ url: string }>> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const { data: row } = await ctx.supabase
    .from("ce_certificates")
    .select("file_path")
    .eq("id", ceId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!row) return { ok: false, error: "CE entry not found." };

  const path = (row as Record<string, unknown>).file_path as string | null;
  if (!path) return { ok: false, error: "No file attached." };

  const { data, error } = await ctx.supabase.storage
    .from("ce_certificates")
    .createSignedUrl(path, 60); // 60s window

  if (error || !data?.signedUrl) {
    console.error("[ce] getCeFileSignedUrl", error);
    return { ok: false, error: "Couldn't generate a download link." };
  }
  return { ok: true, url: data.signedUrl };
}
