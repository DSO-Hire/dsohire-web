/**
 * Phase 5D v1 — narrative types extracted from the server-action module.
 *
 * Per the locked rule (feedback_use_server_only_async.md), "use server"
 * files can only export async functions; co-located non-async exports
 * break at client runtime even though tsc is happy. Client components
 * (WhyThisMatch) import the types from here, and the action's input/
 * output shape from here, while the action file itself only re-exports
 * the async function.
 */

import type { FitBucket } from "./types";

export type PracticeFitNarrativeAudience = "employer" | "candidate";

export interface PracticeFitNarrativeResult {
  ok: true;
  bucket: FitBucket;
  /** Narrative framed for the employer ("Sarah's..."). May be null for low bucket. */
  narrative_employer: string | null;
  /** Narrative framed for the candidate ("Your..."). May be null for low bucket. */
  narrative_candidate: string | null;
  /** True when this call hit Haiku; false when it returned cache. */
  fresh: boolean;
}

export type PracticeFitNarrativeResponse =
  | PracticeFitNarrativeResult
  | { ok: false; error: string };

export interface GeneratePracticeFitNarrativeInput {
  candidateId: string;
  jobId: string;
  /** Caller hint for usage logging only — does not change return shape. */
  audience: PracticeFitNarrativeAudience;
}
