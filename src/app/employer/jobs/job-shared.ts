/**
 * Shared job-action helpers + closed-enum constants (extracted 5G.d, 2026-05-14).
 *
 * This is a PLAIN TS module — deliberately NOT "use server". Both
 * ./actions.ts (the dental-clinical job actions) and ./corporate-actions.ts
 * (the parallel corporate job actions) import from here.
 *
 * Why a separate module: ./actions.ts is "use server", and a "use server"
 * module may only export async server actions whose args are serializable.
 * The helpers below are either sync (makeSlug, validateKnockoutCorrectAnswer,
 * parseExternalLinks, the Sets) or take a non-serializable Supabase client
 * arg (emitJobAuditEvent, resolveAvailableJobSlug) — none can be exported
 * from a "use server" file. Rather than keep parallel copies in the two
 * action files (a pattern that has bitten this codebase before), the
 * shared logic lives here in ONE place.
 *
 * Nothing in here was changed during the extraction — every helper is
 * byte-for-byte what previously lived inline in ./actions.ts.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  VERIFICATION_TYPE_VALUES,
  type VerificationTypeValue,
} from "@/lib/verifications/types";

/* ───── Screening-question payload shape ───── */

export interface ScreeningQuestionPayload {
  id: string | null;
  prompt: string;
  helper_text: string | null;
  kind:
    | "short_text"
    | "long_text"
    | "yes_no"
    | "single_select"
    | "multi_select"
    | "number"
    | "scale";
  options: Array<{ id: string; label: string }> | null;
  required: boolean;
  sort_order: number;
  // E2.10 (2026-05-13) — soft knockout authoring.
  knockout?: boolean;
  knockout_correct_answer?: unknown | null;
}

/* ───── Closed-enum constants ───── */

export const RESERVED_JOB_SLUGS = new Set(["new", "search", "feed"]);

export const VALID_SCOPES = new Set<"location" | "regional" | "corporate">([
  "location",
  "regional",
  "corporate",
]);

export const VALID_KINDS: Set<ScreeningQuestionPayload["kind"]> = new Set([
  "short_text",
  "long_text",
  "yes_no",
  "single_select",
  "multi_select",
  "number",
  "scale",
]);

/* ───── Pure helpers ───── */

export function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

/**
 * E2.10 — Validate the wizard's knockout_correct_answer payload against
 * the question kind + the options the recruiter just authored. Returns
 * the normalized payload (with string-coerced fields), or null if the
 * shape is invalid for the kind. Caller treats null as "no knockout"
 * rather than throwing — knockout is opt-in and a mis-configured payload
 * shouldn't block the save.
 */
export function validateKnockoutCorrectAnswer(
  raw: unknown,
  kind: string,
  options: Array<{ id: string; label: string }> | null
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (kind === "yes_no") {
    const expected = String(r.expected ?? "").toLowerCase();
    if (expected !== "yes" && expected !== "no") return null;
    return { expected };
  }

  if (kind === "single_select") {
    const ids = Array.isArray(r.expected_option_ids)
      ? (r.expected_option_ids as unknown[]).map((x) => String(x))
      : [];
    if (ids.length === 0) return null;
    // Validate against the question's actual option IDs.
    const valid = new Set((options ?? []).map((o) => o.id));
    const filtered = ids.filter((id) => valid.has(id));
    if (filtered.length === 0) return null;
    return { expected_option_ids: filtered };
  }

  if (kind === "multi_select") {
    const ids = Array.isArray(r.must_include_option_ids)
      ? (r.must_include_option_ids as unknown[]).map((x) => String(x))
      : [];
    if (ids.length === 0) return null;
    const valid = new Set((options ?? []).map((o) => o.id));
    const filtered = ids.filter((id) => valid.has(id));
    if (filtered.length === 0) return null;
    return { must_include_option_ids: filtered };
  }

  if (kind === "number") {
    const op = String(r.operator ?? "");
    if (op !== ">=" && op !== "<=" && op !== "=") return null;
    const value =
      typeof r.value === "number" ? r.value : Number(r.value);
    if (!Number.isFinite(value)) return null;
    return { operator: op, value };
  }

  return null;
}

/**
 * E1.12 helper — read external_link_label[] + external_link_url[] from
 * a FormData submission, validate, dedup, cap. Returns { error } on any
 * validation error; returns the parsed array otherwise.
 */
export function parseExternalLinks(
  formData: FormData
): Array<{ label: string; url: string }> | { error: string } {
  const labels = formData.getAll("external_link_label").map((v) => String(v));
  const urls = formData.getAll("external_link_url").map((v) => String(v));
  const pairs: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = (labels[i] ?? "").trim();
    const url = (urls[i] ?? "").trim();
    // Skip fully-empty rows — the wizard may submit blank trailing fields.
    if (!label && !url) continue;
    if (!label) return { error: "External link is missing a label." };
    if (!url) return { error: `External link "${label}" is missing a URL.` };
    if (label.length > 80) {
      return { error: `External link label "${label.slice(0, 30)}..." exceeds 80 characters.` };
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { error: `External link "${label}" must use http or https.` };
      }
    } catch {
      return { error: `External link "${label}" is not a valid URL.` };
    }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ label, url });
    if (pairs.length >= 5) break; // hard cap
  }
  return pairs;
}

/* ───── Supabase-client-arg helpers ───── */

/**
 * Audit-log helper for job mutations. Wraps recordAuditEvent with the
 * actor-resolution boilerplate so each call site stays a one-liner.
 * Fail-open: errors are swallowed inside recordAuditEvent itself.
 */
export async function emitJobAuditEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  jobId: string,
  input: {
    eventKind: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    eventKind: input.eventKind,
    targetTable: "jobs",
    targetId: jobId,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}

export async function resolveAvailableJobSlug(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  baseSlug: string
): Promise<string> {
  if (RESERVED_JOB_SLUGS.has(baseSlug)) {
    return resolveAvailableJobSlug(supabase, dsoId, `${baseSlug}-job`);
  }
  const { data: existing } = await supabase
    .from("jobs")
    .select("id")
    .eq("dso_id", dsoId)
    .eq("slug", baseSlug)
    .maybeSingle();
  if (!existing) return baseSlug;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    const { data: clash } = await supabase
      .from("jobs")
      .select("id")
      .eq("dso_id", dsoId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }
  return `${baseSlug}-${Math.floor(Math.random() * 100000)}`;
}

/* ───── Verification requirements (5G.e Tier 2) ───── */

/**
 * Read the `verification_requirements` multi-value form field and return
 * only the valid, deduped verification-type slugs. The wizard appends one
 * entry per ticked checkbox; anything not in the canonical list is dropped.
 */
export function parseVerificationRequirements(
  formData: FormData
): VerificationTypeValue[] {
  const raw = formData.getAll("verification_requirements").map((v) => String(v));
  const out: VerificationTypeValue[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (
      (VERIFICATION_TYPE_VALUES as ReadonlyArray<string>).includes(v) &&
      !seen.has(v)
    ) {
      seen.add(v);
      out.push(v as VerificationTypeValue);
    }
  }
  return out;
}

/**
 * Replace a job's verification requirements to match `types` — delete-all
 * then insert, the same sync strategy used for job_locations / job_skills.
 * Safe to call with an empty array (clears all requirements).
 */
export async function syncJobVerificationRequirements(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
  types: VerificationTypeValue[]
): Promise<void> {
  await supabase
    .from("job_verification_requirements")
    .delete()
    .eq("job_id", jobId);
  if (types.length > 0) {
    await supabase.from("job_verification_requirements").insert(
      types.map((t) => ({ job_id: jobId, verification_type: t }))
    );
  }
}
