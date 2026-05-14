"use server";

/**
 * /jobs/[id]/apply — inline credential furnishing (5G.e Tier 2, #2).
 *
 * The apply wizard's Verifications step lets a candidate link an existing
 * profile credential as proof. But a candidate with NO matching credential
 * on their profile previously hit a dead end — "add one to your profile"
 * meant leaving the apply flow. This action lets them furnish one inline.
 *
 * What it does:
 *   - Inserts a row into the candidate's OWN profile table
 *     (candidate_licenses / candidate_certifications / candidate_education)
 *     — exactly what the profile editor writes; this is first-party
 *     applicant data, the same category as a résumé.
 *   - Optionally uploads a supporting document to the private
 *     `candidate-credentials` storage bucket and patches `document_path`
 *     (licenses + certifications only — education has no document column).
 *
 * What it deliberately does NOT do:
 *   - It never sets, scores, or asserts `verification_status`. The row is
 *     created unverified and stays that way. DSO Hire is the conduit for
 *     the candidate's own information — verification status is only ever
 *     flipped by the employer's own diligence or a sanctioned third-party
 *     service. See memory: feedback_verification_conduit_not_verifier.md.
 *
 * The wizard calls this imperatively (not useActionState) and, on success,
 * appends the returned credential to its in-memory picker list + links it.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AddCredentialResult } from "./types";

const CREDENTIAL_BUCKET = "candidate-credentials";
const CREDENTIAL_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches profile editor

type InlineKind = "license" | "certification" | "education";

function isInlineKind(v: unknown): v is InlineKind {
  return v === "license" || v === "certification" || v === "education";
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function addInlineCredential(
  formData: FormData
): Promise<AddCredentialResult> {
  const kind = str(formData, "kind");
  if (!isInlineKind(kind)) {
    return { ok: false, error: "Unrecognized credential type." };
  }

  const supabase = await createSupabaseServerClient();

  // Auth — must be a signed-in candidate furnishing their OWN credential.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false,
      error: "Your candidate profile is missing. Please sign up first.",
    };
  }
  const candidateId = candidate.id as string;

  // ── Build the per-kind payload + insert into the candidate's own table ──
  if (kind === "license") {
    const licenseType = str(formData, "license_type");
    if (!licenseType) {
      return { ok: false, error: "License type is required." };
    }
    const licenseNumber = str(formData, "license_number");

    // Defense in depth — DSO Hire intentionally does not collect DEA
    // registrations (memory: feedback_legal_shield_default_posture.md).
    // Mirror the profile editor's reject so the inline path can't become
    // a side door for a fraud-enabling identifier.
    if (licenseNumber) {
      const normalized = licenseNumber.toUpperCase().replace(/[\s-]/g, "");
      if (/^[A-Z]{2}\d{7}$/.test(normalized)) {
        return {
          ok: false,
          error:
            "That looks like a DEA number — please enter your state board license number instead. DSO Hire doesn't collect DEA registrations.",
        };
      }
    }

    const state = str(formData, "state").toUpperCase().slice(0, 2) || null;

    const { data: row, error } = await supabase
      .from("candidate_licenses")
      .insert({
        candidate_id: candidateId,
        license_type: licenseType,
        license_number: licenseNumber || null,
        state,
        display_number: false,
      })
      .select("id, license_type, state")
      .single();
    if (error || !row) {
      console.error("[apply/credential] license insert failed:", error);
      return { ok: false, error: "Couldn't add that license. Please retry." };
    }

    const docError = await maybeUploadDocument(
      supabase,
      formData,
      user.id,
      "license",
      row.id as string,
      "candidate_licenses"
    );
    if (docError) return { ok: false, error: docError };

    return {
      ok: true,
      credential: {
        source: "candidate_license",
        id: row.id as string,
        label: [row.license_type, row.state].filter(Boolean).join(" · "),
      },
    };
  }

  if (kind === "certification") {
    const certKind = str(formData, "cert_kind");
    if (!certKind) {
      return { ok: false, error: "Certification type is required." };
    }
    const certLevel = str(formData, "cert_level");

    const { data: row, error } = await supabase
      .from("candidate_certifications")
      .insert({
        candidate_id: candidateId,
        kind: certKind,
        level: certLevel || null,
      })
      .select("id, kind, level")
      .single();
    if (error || !row) {
      console.error("[apply/credential] certification insert failed:", error);
      return {
        ok: false,
        error: "Couldn't add that certification. Please retry.",
      };
    }

    const docError = await maybeUploadDocument(
      supabase,
      formData,
      user.id,
      "certification",
      row.id as string,
      "candidate_certifications"
    );
    if (docError) return { ok: false, error: docError };

    return {
      ok: true,
      credential: {
        source: "candidate_certification",
        id: row.id as string,
        label: [row.kind, row.level].filter(Boolean).join(" · "),
      },
    };
  }

  // kind === "education" — no document_path column, metadata only.
  const schoolName = str(formData, "school_name");
  if (!schoolName) {
    return { ok: false, error: "School name is required." };
  }
  const degree = str(formData, "degree");
  const fieldOfStudy = str(formData, "field_of_study");

  const { data: row, error } = await supabase
    .from("candidate_education")
    .insert({
      candidate_id: candidateId,
      school_name: schoolName,
      degree: degree || null,
      field_of_study: fieldOfStudy || null,
    })
    .select("id, school_name, degree, field_of_study")
    .single();
  if (error || !row) {
    console.error("[apply/credential] education insert failed:", error);
    return {
      ok: false,
      error: "Couldn't add that education entry. Please retry.",
    };
  }

  const lead = [row.degree, row.field_of_study].filter(Boolean).join(", ");
  return {
    ok: true,
    credential: {
      source: "candidate_education",
      id: row.id as string,
      label: lead
        ? `${lead} — ${row.school_name as string}`
        : (row.school_name as string),
    },
  };
}

/**
 * Optional supporting-document upload for licenses + certifications.
 * Returns an error string on failure, or null when there's no file / the
 * upload succeeded. The credential row already exists by this point — a
 * failed upload doesn't roll it back; the candidate can attach the file
 * later from their profile.
 */
async function maybeUploadDocument(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  formData: FormData,
  authUserId: string,
  kind: "license" | "certification",
  rowId: string,
  table: "candidate_licenses" | "candidate_certifications"
): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;

  if (!CREDENTIAL_MIME.has(file.type)) {
    return "Document must be a PDF, PNG, JPEG, or WebP file.";
  }
  if (file.size > CREDENTIAL_MAX_BYTES) {
    return "Document is too large. Maximum size is 10 MB.";
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${authUserId}/${kind}/${rowId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(CREDENTIAL_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("[apply/credential] document upload failed:", uploadError);
    return "Couldn't upload the supporting document. Please retry.";
  }

  const { error: patchError } = await supabase
    .from(table)
    .update({ document_path: path })
    .eq("id", rowId);
  if (patchError) {
    // Orphan cleanup so the bucket doesn't accumulate unreferenced blobs.
    await supabase.storage.from(CREDENTIAL_BUCKET).remove([path]);
    console.error("[apply/credential] document_path patch failed:", patchError);
    return "Couldn't link the supporting document. Please retry.";
  }

  return null;
}
