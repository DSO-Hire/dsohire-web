"use server";

/**
 * /employer/applications/[id] — server actions for candidate scorecards.
 *
 * Multi-reviewer model: each (application, reviewer) pair has at most one
 * scorecard row, enforced by unique index. Drafts are private to the
 * reviewer (UI-side filter); submitted scorecards are visible to the whole
 * DSO via RLS.
 *
 * Mirrors the moveApplicationStage RLS-aware empty-row pattern: PostgREST
 * returns zero rows when RLS denies a write but no error message, so we
 * treat the empty result as a permission failure.
 *
 * Submission is one-way: once `status = 'submitted'`, the trigger locks
 * the score columns. Reviewers can't edit a submitted scorecard, and we
 * surface that on the UI with a confirmation dialog before submission.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getRubricById,
  parseAttributeScores,
  RECOMMENDATION_ORDER,
  type AttributeScoresMap,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";

export interface ApplicationScorecardRow {
  id: string;
  application_id: string;
  reviewer_user_id: string;
  reviewer_dso_user_id: string;
  rubric_id: string;
  attribute_scores: AttributeScoresMap;
  overall_recommendation: OverallRecommendation | null;
  overall_note: string | null;
  status: "draft" | "submitted";
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

export type UpsertScorecardResult =
  | { ok: true; scorecard: ApplicationScorecardRow }
  | { ok: false; error: string };

export type SubmitScorecardResult =
  | { ok: true; scorecard: ApplicationScorecardRow }
  | { ok: false; error: string };

export type DeleteScorecardResult =
  | { ok: true }
  | { ok: false; error: string };

const RECOMMENDATION_SET = new Set<OverallRecommendation>(RECOMMENDATION_ORDER);

const MAX_NOTE_LENGTH = 4000;
const MAX_ATTRIBUTE_NOTE_LENGTH = 1000;

/* ───────────────────────────────────────────────────────────────
 * Sanitizers
 * ───────────────────────────────────────────────────────────── */

function sanitizeAttributeScores(
  rubricId: string,
  input: unknown
): AttributeScoresMap {
  const rubric = getRubricById(rubricId);
  const validIds = new Set(rubric.attributes.map((a) => a.id));
  const parsed = parseAttributeScores(input);
  const out: AttributeScoresMap = {};
  for (const [attrId, entry] of Object.entries(parsed)) {
    if (!validIds.has(attrId)) continue;
    const score = Math.round(entry.score);
    if (score < 1 || score > 5) continue;
    const note =
      typeof entry.note === "string"
        ? entry.note.trim().slice(0, MAX_ATTRIBUTE_NOTE_LENGTH)
        : undefined;
    out[attrId] = note ? { score, note } : { score };
  }
  return out;
}

function sanitizeRecommendation(
  input: unknown
): OverallRecommendation | null {
  if (typeof input !== "string") return null;
  if (!RECOMMENDATION_SET.has(input as OverallRecommendation)) return null;
  return input as OverallRecommendation;
}

function sanitizeOverallNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

/* ───────────────────────────────────────────────────────────────
 * Upsert (draft)
 * ───────────────────────────────────────────────────────────── */

/**
 * Create or update the current reviewer's draft scorecard for this
 * application. Idempotent: hitting this twice with different inputs
 * mutates the same row (one row per reviewer per application).
 *
 * If the existing row is already submitted, this fails fast — submitted
 * scorecards are immutable.
 */
export async function upsertScorecardDraft({
  applicationId,
  rubricId,
  attributeScores,
  overallRecommendation,
  overallNote,
}: {
  applicationId: string;
  rubricId: string;
  attributeScores: unknown;
  overallRecommendation: unknown;
  overallNote: unknown;
}): Promise<UpsertScorecardResult> {
  if (!applicationId) return { ok: false, error: "Missing application id." };
  if (!rubricId) return { ok: false, error: "Missing rubric id." };

  const cleanScores = sanitizeAttributeScores(rubricId, attributeScores);
  const cleanRecommendation = sanitizeRecommendation(overallRecommendation);
  const cleanOverallNote = sanitizeOverallNote(overallNote);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Resolve reviewer's dso_users row (NOT NULL FK on the scorecard).
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context found." };

  // Look up the reviewer's existing scorecard for this application (if any).
  const { data: existingRaw } = await supabase
    .from("application_scorecards")
    .select(
      "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at"
    )
    .eq("application_id", applicationId)
    .eq("reviewer_user_id", user.id)
    .maybeSingle();

  type RawRow = {
    id: string;
    application_id: string;
    reviewer_user_id: string;
    reviewer_dso_user_id: string;
    rubric_id: string;
    attribute_scores: unknown;
    overall_recommendation: string | null;
    overall_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
  };
  const existing = existingRaw as RawRow | null;

  if (existing && existing.status === "submitted") {
    return {
      ok: false,
      error: "This scorecard has already been submitted and is locked.",
    };
  }

  if (existing) {
    const { data, error } = await supabase
      .from("application_scorecards")
      .update({
        rubric_id: rubricId,
        attribute_scores: cleanScores,
        overall_recommendation: cleanRecommendation,
        overall_note: cleanOverallNote,
      })
      .eq("id", existing.id)
      .select(
        "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at"
      )
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "Could not save scorecard. Check your access.",
      };
    }

    revalidatePath(`/employer/applications/${applicationId}`);
    return { ok: true, scorecard: rowToScorecard(data as RawRow) };
  }

  const { data, error } = await supabase
    .from("application_scorecards")
    .insert({
      application_id: applicationId,
      reviewer_user_id: user.id,
      reviewer_dso_user_id: dsoUser.id as string,
      rubric_id: rubricId,
      attribute_scores: cleanScores,
      overall_recommendation: cleanRecommendation,
      overall_note: cleanOverallNote,
    })
    .select(
      "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at"
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ?? "You don't have access to score this application.",
    };
  }

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true, scorecard: rowToScorecard(data as RawRow) };
}

/* ───────────────────────────────────────────────────────────────
 * Submit (lock)
 * ───────────────────────────────────────────────────────────── */

/**
 * Promote a draft scorecard to `submitted`. The trigger locks the score
 * columns so subsequent updates can't change scores; status stays at
 * 'submitted' and submitted_at is set.
 *
 * Requires at least one attribute score and an overall recommendation —
 * an empty scorecard isn't useful to other reviewers, and the aggregate
 * roll-up depends on having scores to average.
 */
export async function submitScorecard(
  scorecardId: string
): Promise<SubmitScorecardResult> {
  if (!scorecardId) return { ok: false, error: "Missing scorecard id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Read current state to validate completeness before submitting.
  const { data: priorRaw } = await supabase
    .from("application_scorecards")
    .select(
      "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at"
    )
    .eq("id", scorecardId)
    .maybeSingle();

  type RawRow = {
    id: string;
    application_id: string;
    reviewer_user_id: string;
    reviewer_dso_user_id: string;
    rubric_id: string;
    attribute_scores: unknown;
    overall_recommendation: string | null;
    overall_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
  };
  const prior = priorRaw as RawRow | null;
  if (!prior) return { ok: false, error: "Scorecard not found." };
  if (prior.reviewer_user_id !== user.id) {
    return { ok: false, error: "You can only submit your own scorecard." };
  }
  if (prior.status === "submitted") {
    return { ok: false, error: "This scorecard is already submitted." };
  }

  const parsed = parseAttributeScores(prior.attribute_scores);
  if (Object.keys(parsed).length === 0) {
    return {
      ok: false,
      error: "Score at least one attribute before submitting.",
    };
  }
  if (!prior.overall_recommendation) {
    return {
      ok: false,
      error: "Pick an overall recommendation before submitting.",
    };
  }

  const { data, error } = await supabase
    .from("application_scorecards")
    .update({ status: "submitted" })
    .eq("id", scorecardId)
    .select(
      "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at"
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Could not submit scorecard.",
    };
  }

  revalidatePath(`/employer/applications/${(data as RawRow).application_id}`);
  return { ok: true, scorecard: rowToScorecard(data as RawRow) };
}

/* ───────────────────────────────────────────────────────────────
 * Delete (draft only)
 * ───────────────────────────────────────────────────────────── */

export async function deleteScorecardDraft(
  scorecardId: string
): Promise<DeleteScorecardResult> {
  if (!scorecardId) return { ok: false, error: "Missing scorecard id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data: priorRaw } = await supabase
    .from("application_scorecards")
    .select("id, reviewer_user_id, application_id, status")
    .eq("id", scorecardId)
    .maybeSingle();

  type PriorRow = {
    id: string;
    reviewer_user_id: string;
    application_id: string;
    status: string;
  };
  const prior = priorRaw as PriorRow | null;
  if (!prior) return { ok: false, error: "Scorecard not found." };
  if (prior.reviewer_user_id !== user.id) {
    return { ok: false, error: "You can only delete your own draft." };
  }
  if (prior.status !== "draft") {
    return {
      ok: false,
      error: "Submitted scorecards can't be deleted.",
    };
  }

  const { error, data } = await supabase
    .from("application_scorecards")
    .delete()
    .eq("id", scorecardId)
    .select("application_id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Could not delete scorecard.",
    };
  }

  revalidatePath(`/employer/applications/${prior.application_id}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Internal: row → typed scorecard
 * ───────────────────────────────────────────────────────────── */

function rowToScorecard(row: {
  id: string;
  application_id: string;
  reviewer_user_id: string;
  reviewer_dso_user_id: string;
  rubric_id: string;
  attribute_scores: unknown;
  overall_recommendation: string | null;
  overall_note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}): ApplicationScorecardRow {
  return {
    id: row.id,
    application_id: row.application_id,
    reviewer_user_id: row.reviewer_user_id,
    reviewer_dso_user_id: row.reviewer_dso_user_id,
    rubric_id: row.rubric_id,
    attribute_scores: parseAttributeScores(row.attribute_scores),
    overall_recommendation: RECOMMENDATION_SET.has(
      row.overall_recommendation as OverallRecommendation
    )
      ? (row.overall_recommendation as OverallRecommendation)
      : null,
    overall_note: row.overall_note,
    status: row.status === "submitted" ? "submitted" : "draft",
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at,
  };
}
