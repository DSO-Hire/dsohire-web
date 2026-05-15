"use server";

/**
 * Resume import — server actions (Phase 4.1.c).
 *
 * Two actions:
 *
 *   parseResumeAction(formData)
 *     → reads the uploaded file from FormData
 *     → enforces the 24h soft cap (1 free parse per candidate per day)
 *     → calls extractResumeText() then parseResumeWithAI()
 *     → caches the structured payload to candidates.parsed_resume_json
 *     → returns the parsed payload to the wizard for review
 *
 *   saveParsedResumeAction(parsed)
 *     → writes basics + structured tables in one logical transaction
 *     → revalidates /candidate/profile so the editor renders pre-filled
 *
 * Per locked rule R8 the wizard NEVER silent-fills — saveParsedResumeAction
 * is only invoked after the candidate has reviewed + confirmed every
 * section in the review screen.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractResumeText,
  ResumeExtractionError,
  type ResumeExtractionErrorKind,
} from "@/lib/resume/extract";
import { parseResumeWithAI, type ParsedResume } from "@/lib/resume/parse";
import { getCandidateRecentAiUsage } from "@/lib/ai/usage";
import { canonicalizeSkill } from "@/lib/candidate/canonical-lists";
import { splitFullName } from "@/lib/candidate/name";

// ─────────────────────────────────────────────────────────────────────
// parseResumeAction
// ─────────────────────────────────────────────────────────────────────

export type ParseResumeActionResult =
  | { ok: true; parsed: ParsedResume }
  | {
      ok: false;
      error: string;
      errorCode:
        | "not_signed_in"
        | "no_candidate_record"
        | "no_file"
        | "cap_exceeded"
        | ResumeExtractionErrorKind
        | "ai_request_failed"
        | "ai_parse_failed"
        | "input_too_short"
        | "input_too_long"
        | "save_cache_failed";
    };

const PARSE_CAP_PER_HOURS = 24;

export async function parseResumeAction(
  formData: FormData
): Promise<ParseResumeActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      errorCode: "not_signed_in",
      error: "Please sign in to import a resume.",
    };
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false,
      errorCode: "no_candidate_record",
      error:
        "Your candidate record isn't ready yet. Try reloading the page.",
    };
  }

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      errorCode: "no_file",
      error: "No file received. Drop a PDF or DOCX onto the page.",
    };
  }

  // 24h soft cap — 1 free parse per candidate per day.
  const recent = await getCandidateRecentAiUsage(
    user.id,
    "resume_parse",
    PARSE_CAP_PER_HOURS
  );
  if (recent.count >= 1) {
    return {
      ok: false,
      errorCode: "cap_exceeded",
      error:
        "You've already imported a resume in the last 24 hours. Edit your profile manually, or try again tomorrow.",
    };
  }

  // Extract text.
  const bytes = await file.arrayBuffer();
  let extracted;
  try {
    extracted = await extractResumeText({
      bytes,
      mimeType: file.type,
      filename: file.name,
    });
  } catch (err) {
    if (err instanceof ResumeExtractionError) {
      return { ok: false, errorCode: err.kind, error: err.message };
    }
    return {
      ok: false,
      errorCode: "extraction_failed",
      error:
        err instanceof Error
          ? `Couldn't read this file: ${err.message}`
          : "Couldn't read this file.",
    };
  }

  // Hand text to the LLM parser.
  const result = await parseResumeWithAI({
    text: extracted.text,
    userId: user.id,
  });
  if (!result.ok) {
    return { ok: false, errorCode: result.errorCode, error: result.error };
  }

  // v1.6 — canonicalize free-text skills so the candidate's stored
  // values share the canonical vocabulary used on the job-side picker.
  // Practice Fit's skills dim does case-insensitive equality; matching
  // canonical-to-canonical produces real matches instead of textual
  // misses ("scaling" → "Scaling & root planing"). De-duplicates the
  // resulting array since the parser sometimes emits both raw + canon.
  if (result.parsed.skills.length > 0) {
    const canon = result.parsed.skills.map(canonicalizeSkill);
    const seen = new Set<string>();
    result.parsed.skills = canon.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // Cache the parsed payload + page count + warnings on the candidate
  // row so we can replay or re-classify later. Best-effort — failure
  // here doesn't break the wizard since the parsed payload is still
  // returned to the client.
  const cachePayload = {
    parsed: result.parsed,
    extracted: {
      format: extracted.format,
      pageCount: extracted.pageCount,
      warnings: extracted.warnings,
    },
    parsedAt: new Date().toISOString(),
  };
  const { error: cacheErr } = await supabase
    .from("candidates")
    .update({
      parsed_resume_json: cachePayload,
      last_parsed_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
  if (cacheErr) {
    console.warn("[resume/import] failed to cache parsed_resume_json", cacheErr);
  }

  return { ok: true, parsed: result.parsed };
}

// ─────────────────────────────────────────────────────────────────────
// saveParsedResumeAction
// ─────────────────────────────────────────────────────────────────────

export type SaveParsedResumeActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      errorCode:
        | "not_signed_in"
        | "no_candidate_record"
        | "save_failed";
    };

/**
 * Writes a reviewed `ParsedResume` back to the candidate's profile.
 *
 * Strictly speaking this is not a single Postgres transaction — Supabase's
 * PostgREST API doesn't expose multi-statement transactions to clients —
 * but the writes are sequenced + the failure mode is logged + reversible
 * (the cache in `parsed_resume_json` is the authoritative re-import
 * source). For v1 this trades a small consistency window for simplicity;
 * if we need a true transaction we'll wrap this in a Postgres function.
 */
export async function saveParsedResumeAction(
  parsed: ParsedResume
): Promise<SaveParsedResumeActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      errorCode: "not_signed_in",
      error: "Please sign in to save your profile.",
    };
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false,
      errorCode: "no_candidate_record",
      error: "Your candidate record isn't ready yet.",
    };
  }

  // ── Basics → candidates row update ────────────────────────────────
  // Only write fields the user actually has values for; null fields
  // stay null on the row so the existing profile editor still shows
  // empty placeholders to fill.
  const basics = parsed.basics;
  const candidateUpdate: Record<string, unknown> = {};
  if (basics.full_name.value) {
    const { first_name, last_name } = splitFullName(basics.full_name.value);
    if (first_name) candidateUpdate.first_name = first_name;
    if (last_name) candidateUpdate.last_name = last_name;
  }
  if (basics.phone.value) candidateUpdate.phone = basics.phone.value;
  if (basics.headline.value) candidateUpdate.headline = basics.headline.value;
  if (basics.summary.value) candidateUpdate.summary = basics.summary.value;
  if (basics.years_experience_dental.value !== null) {
    candidateUpdate.years_experience = basics.years_experience_dental.value;
  }
  if (basics.linkedin_url.value)
    candidateUpdate.linkedin_url = basics.linkedin_url.value;
  if (parsed.desired_roles.length > 0)
    candidateUpdate.desired_roles = parsed.desired_roles;

  if (Object.keys(candidateUpdate).length > 0) {
    const { error } = await supabase
      .from("candidates")
      .update(candidateUpdate)
      .eq("id", candidate.id);
    if (error) {
      console.error("[resume/import] update candidates failed", error);
      return {
        ok: false,
        errorCode: "save_failed",
        error:
          "We couldn't save your profile basics. Try again or edit fields manually.",
      };
    }
  }

  // ── Structured tables: insert all entries.
  //    We do NOT delete existing rows — this is an additive import. The
  //    profile editor handles dedup + edit later. The review UI warned
  //    the candidate that import will add (not replace) entries.
  const workRows = parsed.work_history
    .filter((w) => w.title.value || w.company_name.value)
    .map((w) => ({
      candidate_id: candidate.id,
      title: w.title.value ?? "(untitled)",
      company_name: w.company_name.value ?? "(unknown)",
      is_dso: w.is_dso.value,
      start_date: w.start_date.value
        ? normalizeDate(w.start_date.value)
        : null,
      end_date: w.end_date.value ? normalizeDate(w.end_date.value) : null,
      is_current: w.is_current.value ?? false,
      description: w.description.value,
      pms_systems_used: w.pms_systems_used.value ?? [],
      procedures_performed: w.procedures_performed.value ?? [],
    }));
  if (workRows.length > 0) {
    const { error } = await supabase
      .from("candidate_work_history")
      .insert(workRows);
    if (error) {
      console.error("[resume/import] insert work history failed", error);
      // Don't bail — keep going. Partial imports are better than none.
    }
  }

  const educationRows = parsed.education
    .filter((e) => e.school_name.value)
    .map((e) => ({
      candidate_id: candidate.id,
      school_name: e.school_name.value!,
      degree: e.degree.value,
      field_of_study: e.field_of_study.value,
      start_year: e.start_year.value,
      end_year: e.end_year.value,
      description: e.description.value,
    }));
  if (educationRows.length > 0) {
    const { error } = await supabase
      .from("candidate_education")
      .insert(educationRows);
    if (error) {
      console.error("[resume/import] insert education failed", error);
    }
  }

  // DEA-format scrubber — if the resume parser surfaced what looks
  // like a DEA registration in the license_number field, drop it to
  // null at import time. Memory: feedback_legal_shield_default_posture.md.
  // Pattern: 2 letters + 7 digits, ignoring whitespace + dashes.
  const scrubDeaFormat = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.toUpperCase().replace(/[\s-]/g, "");
    if (/^[A-Z]{2}\d{7}$/.test(normalized)) return null;
    return value;
  };

  const licenseRows = parsed.licenses
    .filter((l) => l.license_type.value)
    .map((l) => ({
      candidate_id: candidate.id,
      license_type: l.license_type.value!,
      license_number: scrubDeaFormat(l.license_number.value),
      state: l.state.value,
      issued_date: l.issued_date.value
        ? normalizeDate(l.issued_date.value)
        : null,
      expires_date: l.expires_date.value
        ? normalizeDate(l.expires_date.value)
        : null,
      // R3 locked: never opt-in display on import. Candidate must
      // explicitly toggle in the privacy & visibility settings.
      display_number: false,
    }));
  if (licenseRows.length > 0) {
    const { error } = await supabase
      .from("candidate_licenses")
      .insert(licenseRows);
    if (error) {
      console.error("[resume/import] insert licenses failed", error);
    }
  }

  const certRows = parsed.certifications
    .filter((c) => c.kind.value)
    .map((c) => ({
      candidate_id: candidate.id,
      kind: c.kind.value!,
      level: c.level.value,
      issued_date: c.issued_date.value
        ? normalizeDate(c.issued_date.value)
        : null,
      expires_date: c.expires_date.value
        ? normalizeDate(c.expires_date.value)
        : null,
    }));
  if (certRows.length > 0) {
    const { error } = await supabase
      .from("candidate_certifications")
      .insert(certRows);
    if (error) {
      console.error("[resume/import] insert certifications failed", error);
    }
  }

  revalidatePath("/candidate/profile");
  revalidatePath("/candidate/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * The LLM emits dates as YYYY-MM or YYYY-MM-DD. Postgres `date` columns
 * require a full date — pad YYYY-MM to YYYY-MM-01 so inserts succeed
 * without manual coercion. Also tolerates messy LLM output by returning
 * null on anything that doesn't look like a date.
 */
function normalizeDate(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  return null;
}
