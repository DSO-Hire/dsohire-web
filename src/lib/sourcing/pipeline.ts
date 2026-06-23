/**
 * Prospect pipeline data layer (Sourcing CRM — Phase 1).
 *
 * The pool row (dso_talent_pool_entries) IS the prospect record; pipeline_stage
 * + last_activity_at make it stage-able. This module is the single masking-aware
 * reader for the pipeline board plus the activity-log writer.
 *
 * Privacy: masking is applied here exactly like the saved tab — masked
 * candidates (anonymous_mode && !appliedToThisDso) expose only
 * anonymousDisplayLabel + professional attributes, never real name/avatar.
 * Applied candidates render as "converted" regardless of stored stage.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  anonymousDisplayLabel,
  getDsoAppliedCandidateIds,
  embeddedRow,
} from "@/lib/candidate/anonymity";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ProspectStage =
  | "sourced"
  | "contacted"
  | "responded"
  | "nurturing"
  | "converted"
  | "archived";

export const PROSPECT_STAGE_LABELS: Record<ProspectStage, string> = {
  sourced: "Sourced",
  contacted: "Contacted",
  responded: "Responded",
  nurturing: "Nurturing",
  converted: "Converted",
  archived: "Archived",
};

/** Columns shown on the kanban-lite board (archived is dismissed, off-board). */
export const PROSPECT_BOARD_STAGES: ProspectStage[] = [
  "sourced",
  "contacted",
  "responded",
  "nurturing",
  "converted",
];

export const PROSPECT_STAGE_ACCENT: Record<ProspectStage, string> = {
  sourced: "text-slate-meta",
  contacted: "text-heritage-deep",
  responded: "text-amber-600",
  nurturing: "text-heritage-deep",
  converted: "text-emerald-600",
  archived: "text-slate-meta",
};

export function isValidProspectStage(v: string): v is ProspectStage {
  return (
    v === "sourced" ||
    v === "contacted" ||
    v === "responded" ||
    v === "nurturing" ||
    v === "converted" ||
    v === "archived"
  );
}

export interface ProspectCard {
  entryId: string;
  candidateId: string;
  /** Derived stage: applied → always "converted"; else stored stage. */
  stage: ProspectStage;
  /** Masked label or real name. */
  displayName: string;
  masked: boolean;
  headline: string | null;
  currentTitle: string | null;
  yearsExperience: number | null;
  location: string | null;
  avatarUrl: string | null;
  tags: string[] | null;
  hasNotes: boolean;
  lastActivityAt: string;
  applied: boolean;
}

/**
 * Load this DSO's prospects as masking-aware cards. Archived entries are
 * excluded from the board.
 */
export async function getProspectPipeline(
  supabase: ServerClient,
  dsoId: string,
): Promise<ProspectCard[]> {
  if (!dsoId) return [];

  const { data: entries } = await supabase
    .from("dso_talent_pool_entries")
    .select(
      "id, candidate_id, notes, tags, pipeline_stage, last_activity_at, " +
        "candidates(full_name, headline, current_title, years_experience, avatar_url, anonymous_mode, desired_roles, current_location_city, current_location_state)",
    )
    .eq("dso_id", dsoId)
    .order("last_activity_at", { ascending: false });

  type CandidateEmbed = {
    full_name: string | null;
    headline: string | null;
    current_title: string | null;
    years_experience: number | null;
    avatar_url: string | null;
    anonymous_mode: boolean | null;
    desired_roles: string[] | null;
    current_location_city: string | null;
    current_location_state: string | null;
  };
  const rows = (entries ?? []) as unknown as Array<{
    id: string;
    candidate_id: string;
    notes: string | null;
    tags: string[] | null;
    pipeline_stage: string | null;
    last_activity_at: string;
    // PostgREST may hand this back as an object OR a one-element array.
    candidates: CandidateEmbed | CandidateEmbed[] | null;
  }>;
  if (rows.length === 0) return [];

  const applied = await getDsoAppliedCandidateIds(
    supabase,
    dsoId,
    rows.map((r) => r.candidate_id),
  );

  return rows.map((r) => {
    const c = embeddedRow(r.candidates);
    const isApplied = applied.has(r.candidate_id);
    const masked = Boolean(c?.anonymous_mode) && !isApplied;
    const stored = isValidProspectStage(r.pipeline_stage ?? "")
      ? (r.pipeline_stage as ProspectStage)
      : "sourced";
    // Applied → converted, always (an application is a real conversion).
    const stage: ProspectStage = isApplied ? "converted" : stored;
    const location =
      [c?.current_location_city, c?.current_location_state]
        .filter(Boolean)
        .join(", ") || null;
    return {
      entryId: r.id,
      candidateId: r.candidate_id,
      stage,
      displayName: masked
        ? anonymousDisplayLabel(c ?? {})
        : c?.full_name ?? "Candidate",
      masked,
      headline: c?.headline ?? null,
      currentTitle: c?.current_title ?? null,
      yearsExperience: c?.years_experience ?? null,
      location,
      avatarUrl: masked ? null : c?.avatar_url ?? null,
      tags: r.tags,
      hasNotes: Boolean(r.notes && r.notes.trim()),
      lastActivityAt: r.last_activity_at,
      applied: isApplied,
    };
  });
}

export type ProspectActivityKind =
  | "saved"
  | "outreach_sent"
  | "opened"
  | "replied"
  | "stage_change"
  | "converted"
  | "opted_out";

/**
 * Append a prospect-timeline activity. Pass the caller's client for
 * user-initiated rows (recruiter+ RLS); pass the service-role client for
 * system rows. Fire-and-forget friendly — never throws.
 */
export async function logProspectActivity(
  client: ServerClient,
  input: {
    dsoId: string;
    candidateId: string;
    kind: ProspectActivityKind;
    actorDsoUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await client.from("dso_prospect_activities").insert({
      dso_id: input.dsoId,
      candidate_id: input.candidateId,
      kind: input.kind,
      actor_dso_user_id: input.actorDsoUserId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Activity log is best-effort; never block the primary action.
  }
}
