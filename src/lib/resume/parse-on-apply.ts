/**
 * Parse-on-apply (2026-07-10) — background resume extraction for a
 * just-submitted application.
 *
 * Called fire-and-forget from BOTH apply paths (auth'd + guest) via
 * next/server after(), so the candidate's submit response never waits on
 * the LLM. Downloads the application's resume from the private `resumes`
 * bucket, runs the SAME two-stage pipeline the candidate-initiated import
 * uses (extract.ts → parse.ts), and snapshots the result onto the
 * applications row (resume_parse / resume_parse_status / resume_parsed_at).
 *
 * R8 boundary: the snapshot is employer-facing application context. It is
 * NEVER written to the candidate's profile — profile writes still require
 * the candidate's confirm flow in /candidate/profile/import.
 *
 * Failure posture mirrors the rest of the apply flow: every error path
 * logs, writes an honest failed-status row, and returns. No throws reach
 * the caller. Cost: ~1-2¢/application on Haiku (logged to ai_usage_events
 * under the existing resume_parse feature; guest parses have no auth user
 * so their usage-log insert fails FK and is warn-swallowed — acceptable).
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  extractResumeText,
  ResumeExtractionError,
} from "@/lib/resume/extract";
import { parseResumeWithAI } from "@/lib/resume/parse";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export interface ParseResumeForApplicationInput {
  applicationId: string;
  /** Storage path within the `resumes` bucket (applications.resume_url). */
  resumePath: string | null;
  /**
   * auth.users.id when the applicant has an account; the candidates.id for
   * guests (usage-log FK will warn-swallow — parse still runs and lands).
   */
  userIdForUsageLog: string;
}

export async function parseResumeForApplication(
  input: ParseResumeForApplicationInput
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  async function writeResult(
    status: "ok" | "failed" | "skipped",
    payload: unknown
  ): Promise<void> {
    const { error } = await admin
      .from("applications")
      .update({
        resume_parse: payload,
        resume_parse_status: status,
        resume_parsed_at: new Date().toISOString(),
      })
      .eq("id", input.applicationId);
    if (error) {
      console.warn("[parse-on-apply] snapshot write failed", {
        applicationId: input.applicationId,
        error,
      });
    }
  }

  try {
    if (!input.resumePath) {
      await writeResult("skipped", { error_kind: "no_resume" });
      return;
    }

    const { data: blob, error: downloadErr } = await admin.storage
      .from("resumes")
      .download(input.resumePath);
    if (downloadErr || !blob) {
      await writeResult("failed", {
        error_kind: "download_failed",
        message: downloadErr?.message ?? "Couldn't download the resume file.",
      });
      return;
    }

    const filename = input.resumePath.split("/").pop() ?? "resume";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME_BY_EXT[ext] ?? blob.type ?? "application/octet-stream";

    let text: string;
    try {
      const extraction = await extractResumeText({
        bytes: await blob.arrayBuffer(),
        mimeType,
        filename,
      });
      text = extraction.text;
    } catch (err) {
      const kind =
        err instanceof ResumeExtractionError ? err.kind : "extraction_failed";
      await writeResult("failed", {
        error_kind: kind,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const result = await parseResumeWithAI({
      text,
      userId: input.userIdForUsageLog,
    });
    if (!result.ok) {
      await writeResult("failed", {
        error_kind: result.errorCode,
        message: result.error,
      });
      return;
    }

    await writeResult("ok", result.parsed);
  } catch (err) {
    console.warn("[parse-on-apply] unexpected error", {
      applicationId: input.applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await writeResult("failed", {
        error_kind: "unexpected",
        message: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* already logged */
    }
  }
}
