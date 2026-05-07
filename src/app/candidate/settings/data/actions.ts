"use server";

/**
 * Data & Account server actions (Phase 4.3.f → 4.5.g upgrade).
 *
 * Two main actions:
 *   • exportMyData — pulls every candidate-owned row + every storage-attached
 *     file (resume PDF, CE certificates, avatar) and returns a ZIP-ready
 *     payload. v1 generates synchronously, in-memory. The async-via-email
 *     path with 24h availability is a follow-up that doesn't change this
 *     contract — the page builds the ZIP client-side from the payload.
 *   • softDeleteAccount — sets candidates.deleted_at, signs the user out
 *     globally, returns success. A future cron hard-deletes 30 days
 *     after deleted_at. Restore-on-sign-in lives at /candidate/restore.
 *
 * The "withdraw applications" link is a static deep-link, no action
 * needed here — clicking it on the page navigates to the existing
 * /candidate/applications surface.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildExportZip,
  extFromStoragePath,
  exportTimestamp,
  type ZipFile,
} from "@/lib/data-export/build-zip";

const SOFT_DELETE_GRACE_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ExportPayload {
  exported_at: string;
  exported_by: string;
  format_version: 2;
  candidate: Record<string, unknown> | null;
  work_history: unknown[];
  education: unknown[];
  licenses: unknown[];
  certifications: unknown[];
  ce_certificates: unknown[];
  applications: unknown[];
  notification_preferences: unknown[];
  blocked_employers: unknown[];
  saved_searches: unknown[];
  notes: string;
}

export type ExportResult =
  | {
      ok: true;
      /** Blob of the ZIP — caller pipes to a download. */
      zipBytes: ArrayBuffer;
      filename: string;
      fetchFailures: Array<{ pathInZip: string; reason: string }>;
    }
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
    ceCertificates,
    applications,
    notificationPrefs,
    blockedEmployers,
    savedSearches,
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
      .from("ce_certificates")
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
    supabase
      .from("candidate_saved_searches")
      .select("*")
      .eq("candidate_id", candidateId)
      .then((r) => r.data ?? []),
  ]);

  // Build the file list — resume + CE certs + avatar — all storage-backed.
  const files: ZipFile[] = [];

  // Resume — `candidates.resume_url` is a full public URL; the file lives
  // at `resumes/${user.id}/<timestamp>-<filename>`. Extract the storage
  // path from the URL by stripping the bucket prefix.
  const resumeUrl = (candidate as Record<string, unknown>).resume_url as
    | string
    | null;
  if (resumeUrl) {
    const resumePath = parseStoragePath(resumeUrl, "resumes");
    if (resumePath) {
      const ext = extFromStoragePath(resumePath) || "pdf";
      files.push({
        pathInZip: `resume.${ext}`,
        bucket: "resumes",
        storagePath: resumePath,
      });
    }
  }

  // CE certificates — `ce_certificates.file_path` is a storage path.
  for (const [i, ce] of (
    ceCertificates as Array<Record<string, unknown>>
  ).entries()) {
    const path = ce.file_path as string | null;
    if (!path) continue;
    const ext = extFromStoragePath(path) || "pdf";
    const safeName = String(ce.course_name ?? `cert-${i + 1}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    files.push({
      pathInZip: `ce-certificates/${String(i + 1).padStart(2, "0")}-${safeName}.${ext}`,
      bucket: "ce_certificates",
      storagePath: path,
    });
  }

  // Avatar — `candidates.avatar_url` is a public URL into the
  // `public-images` bucket (path is `<auth_user_id>/avatar/<file>`).
  const avatarUrl = (candidate as Record<string, unknown>).avatar_url as
    | string
    | null;
  if (avatarUrl) {
    const avatarPath = parseStoragePath(avatarUrl, "public-images");
    if (avatarPath) {
      const ext = extFromStoragePath(avatarPath) || "jpg";
      files.push({
        pathInZip: `avatar.${ext}`,
        bucket: "public-images",
        storagePath: avatarPath,
      });
    }
  }

  const payload: ExportPayload = {
    exported_at: new Date().toISOString(),
    exported_by: user.email ?? user.id,
    format_version: 2,
    candidate: candidate as Record<string, unknown>,
    work_history: workHistory,
    education,
    licenses,
    certifications,
    ce_certificates: ceCertificates,
    applications,
    notification_preferences: notificationPrefs,
    blocked_employers: blockedEmployers,
    saved_searches: savedSearches,
    notes:
      "This export contains every row tied to your DSO Hire account that we can " +
      "share without exposing other users. Application screening answers + employer " +
      "comments authored about your application are excluded for the privacy of the " +
      "DSO. Email cam@dsohire.com if you need a more comprehensive export.",
  };

  const readme = [
    "DSO Hire — your data export",
    `Exported: ${payload.exported_at}`,
    `For: ${payload.exported_by}`,
    "",
    "Contents:",
    "  data.json              — every row tied to your account",
    "  resume.<ext>           — your most recent uploaded resume (if any)",
    "  ce-certificates/       — every CE certificate file you've attached",
    "  avatar.<ext>           — your profile photo (if set)",
    "",
    "If any files were skipped due to a fetch error, see MISSING_FILES.txt.",
    "Questions? Email cam@dsohire.com.",
  ].join("\n");

  const { blob, fetchFailures } = await buildExportZip(supabase, {
    data: payload as unknown as Record<string, unknown>,
    files,
    readme,
  });

  // Return the ZIP as ArrayBuffer — Server Actions can't return Blobs
  // directly across the wire (they serialize to JSON-ish), so we
  // hand back the underlying bytes; the client constructs the Blob
  // for download.
  const zipBytes = await blob.arrayBuffer();
  const filename = `dsohire-export-${exportTimestamp()}.zip`;

  return { ok: true, zipBytes, filename, fetchFailures };
}

/**
 * Extract the storage path from a Supabase public URL.
 *
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path…>
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path…>?token=...
 *
 * Returns null if the URL doesn't reference the given bucket.
 */
function parseStoragePath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // Expect: ["storage", "v1", "object", "public" | "sign", "<bucket>", ...rest]
    const bucketIdx = parts.indexOf(bucket);
    if (bucketIdx < 0) return null;
    const rest = parts.slice(bucketIdx + 1);
    if (rest.length === 0) return null;
    return rest.join("/");
  } catch {
    return null;
  }
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
