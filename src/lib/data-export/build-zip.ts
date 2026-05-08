/**
 * Shared ZIP export builder (Phase 4.5.g).
 *
 * Used by both candidate-side (/candidate/settings/data) and
 * employer-side (/employer/settings/data) export actions to bundle:
 *   • A canonical data.json describing the user's structured rows
 *   • Every storage-attached file the user has rights to (resume, CE
 *     certificates, avatar; or DSO logos, location logos, dso_photos)
 *
 * Runs server-side under "use server" callers — never call from a
 * client component. JSZip itself works in both, but the storage
 * fetches must use the user's authed Supabase client (RLS enforces
 * which files are theirs to download).
 *
 * The output is a Blob ready for download. v1 generates synchronously
 * in-memory; for big employer exports (>100MB) a future sub-phase
 * moves this to a background job + email-link delivery.
 */

import JSZip from "jszip";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/contact";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ZipFile {
  /** Path inside the ZIP, e.g. "resume.pdf" or "ce-certificates/01-implants.pdf". */
  pathInZip: string;
  /** Storage bucket id, e.g. "resumes" or "ce_certificates". */
  bucket: string;
  /** Storage object path, the same one stored in the row's file_path/url. */
  storagePath: string;
}

export interface BuildZipInput {
  /** A canonical JSON snapshot of the user's structured rows. */
  data: Record<string, unknown>;
  /** Filename inside the ZIP for the canonical JSON, e.g. "data.json". */
  dataFilename?: string;
  /** Files to bundle from Supabase Storage. */
  files: ZipFile[];
  /** Optional README written at the top level of the ZIP. */
  readme?: string;
}

export interface BuildZipResult {
  blob: Blob;
  /** Files that failed to fetch + their error — surfaced to the user, doesn't fail the build. */
  fetchFailures: Array<{ pathInZip: string; reason: string }>;
}

/**
 * Build a downloadable ZIP for the given data + file list.
 *
 * File downloads happen sequentially against the supabase storage API.
 * Failures are collected (not thrown) so a single missing file doesn't
 * block the entire export.
 */
export async function buildExportZip(
  supabase: SupabaseClient,
  input: BuildZipInput
): Promise<BuildZipResult> {
  const zip = new JSZip();

  // 1. data.json — the canonical structured payload
  zip.file(
    input.dataFilename ?? "data.json",
    JSON.stringify(input.data, null, 2)
  );

  // 2. Optional README
  if (input.readme) {
    zip.file("README.txt", input.readme);
  }

  // 3. Files from storage
  const fetchFailures: BuildZipResult["fetchFailures"] = [];
  for (const file of input.files) {
    try {
      const { data: blob, error } = await supabase.storage
        .from(file.bucket)
        .download(file.storagePath);
      if (error || !blob) {
        fetchFailures.push({
          pathInZip: file.pathInZip,
          reason: error?.message ?? "Empty response",
        });
        continue;
      }
      // JSZip accepts Blob directly; arrayBuffer() is the safer cross-platform path.
      const buf = await blob.arrayBuffer();
      zip.file(file.pathInZip, buf);
    } catch (err) {
      fetchFailures.push({
        pathInZip: file.pathInZip,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // 4. Surface failures inside the ZIP itself so the user has a record
  if (fetchFailures.length > 0) {
    const lines = [
      "Some files couldn't be included in this export.",
      `Email ${SUPPORT_EMAIL} if you need them.`,
      "",
      ...fetchFailures.map(
        (f) => `- ${f.pathInZip}  (reason: ${f.reason})`
      ),
    ];
    zip.file("MISSING_FILES.txt", lines.join("\n"));
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { blob, fetchFailures };
}

/**
 * Helper — derive the file extension from a storage path. Returns the
 * extension WITHOUT the dot, or "" if there isn't one. Used so the
 * pathInZip carries a sensible suffix even when the storage path
 * doesn't.
 */
export function extFromStoragePath(storagePath: string): string {
  const lastSlash = storagePath.lastIndexOf("/");
  const filename = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return "";
  return filename.slice(lastDot + 1);
}

/**
 * Build a yyyy-mm-ddThh-mm-ss timestamp safe for filenames.
 */
export function exportTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
