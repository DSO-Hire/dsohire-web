/**
 * /employer/settings/pipeline — shared types + constants (Phase 5A
 * Track B follow-on, 2026-05-12).
 *
 * Lives separately from actions.ts so the "use server" file only exports
 * async functions (per feedback_use_server_only_async.md). Also pulled
 * out so the page + editor can share copy without importing through
 * the server-action module.
 */

import type { PipelineStage, StageKind } from "@/lib/applications/stages";

export type PipelineActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Subscription tiers that unlock CRUD on pipeline stages. */
export const PIPELINE_CRUD_TIERS = new Set(["growth", "scale", "enterprise"]);

/** Cap copy lives alongside MAX_STAGES_PER_DSO in stages.ts. */
export const PIPELINE_KIND_HELP: Record<StageKind, string> = {
  open: "Brand-new applications land here.",
  screen: "Internal review before reaching out.",
  interview: "Active interview process.",
  offer: "Offer extended, awaiting response.",
  hired: "Filled the role.",
  rejected: "Not moving forward.",
  withdrawn: "Candidate pulled themselves.",
};

export interface PipelineEditorInitialProps {
  stages: PipelineStage[];
  canEdit: boolean;
  tier: string | null;
}
