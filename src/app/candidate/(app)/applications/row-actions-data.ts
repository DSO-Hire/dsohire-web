/**
 * Plain data + types for the candidate applications row actions
 * (Phase 4.4 row actions).
 *
 * Lives in its own non-"use server" module so the client menu can
 * import the option arrays directly. Server-action files (marked
 * "use server") can only export async functions — non-function exports
 * land on the client as function references, not the values
 * themselves. Caught 2026-05-06 evening when SELF_REPORTED_OPTIONS
 * was originally co-located in row-actions.ts and the modal threw
 * "j.map is not a function" on first render.
 *
 * Same lesson family as feedback_rsc_boundary_lesson.md — server-side
 * module boundaries enforce constraints TypeScript doesn't catch.
 */

export type SelfReportedStatus =
  | "interviewing"
  | "offer_received"
  | "hired"
  | "no_longer_interested";

export const WITHDRAW_REASON_CHIPS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "found_another_role", label: "Found another role" },
  { value: "compensation_low", label: "Pay didn't meet expectations" },
  { value: "location_mismatch", label: "Location didn't work" },
  { value: "process_too_slow", label: "Process took too long" },
  { value: "no_response", label: "Heard nothing back" },
  { value: "exploring", label: "Just exploring" },
  { value: "other", label: "Other" },
];

export const SELF_REPORTED_OPTIONS: ReadonlyArray<{
  value: SelfReportedStatus | null;
  label: string;
}> = [
  { value: null, label: "Clear my self-reported status" },
  { value: "interviewing", label: "I'm interviewing" },
  { value: "offer_received", label: "I received an offer" },
  { value: "hired", label: "I was hired" },
  { value: "no_longer_interested", label: "I'm no longer interested" },
];
