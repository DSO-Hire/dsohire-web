/**
 * Canonical offer-decline reasons (Analytics Phase 1).
 *
 * A structured, aggregatable code set so the analytics Offers tab can chart
 * "why offers were declined" cleanly — free-text never aggregates. The
 * candidate picks one on the decline form; the code persists to
 * application_offer_responses.decline_reason_code. Free-text `reason` is
 * still captured alongside for color.
 *
 * Shared by the candidate decline form (/o/[token]) and hub-metrics so the
 * label mapping lives in exactly one place.
 */

export const DECLINE_REASONS = [
  { code: "accepted_other_offer", label: "Accepted another offer" },
  { code: "compensation", label: "Compensation / pay" },
  { code: "location_commute", label: "Location / commute" },
  { code: "schedule", label: "Schedule / hours" },
  { code: "role_fit", label: "Role wasn't the right fit" },
  { code: "timing", label: "Timing — not ready to move" },
  { code: "counteroffer", label: "Counteroffer from current employer" },
  { code: "other", label: "Other" },
] as const;

export type DeclineReasonCode = (typeof DECLINE_REASONS)[number]["code"];

export const DECLINE_REASON_CODES: readonly string[] = DECLINE_REASONS.map(
  (r) => r.code
);

export function declineReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DECLINE_REASONS.find((r) => r.code === code)?.label ?? null;
}
