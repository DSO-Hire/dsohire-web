/**
 * PracticeFit placeholder pill — shown candidate-side when a job/candidate
 * pair has no scored fit (role-as-filter rejected, or compute hasn't yet
 * populated). The candidate's own data tells us why; this component reads
 * a `reason` prop and picks precise label + tooltip copy.
 *
 * Why this lives here vs employer-side: the employer surface keeps a
 * generic "fit unavailable" banner because RLS makes consent-off look
 * identical to "candidate doesn't exist," and disambiguating would leak
 * existence. The candidate is looking at their OWN data, so they have
 * full self-knowledge and we can be specific.
 *
 * Consumers:
 *   • /candidate/applications (Active tab)  — both reasons render
 *   • /candidate/jobs                       — only role_mismatch renders
 *                                             (unavailable is muted to
 *                                             avoid pill clutter on
 *                                             browse)
 *   • /candidate/applications saved tab     — only role_mismatch renders
 */

import { Sparkles } from "lucide-react";
import { canonicalizeRoleCategory } from "@/lib/practice-fit/role-canonicalize";

/**
 * Reason a PracticeFit chip is showing as a placeholder rather than a
 * scored chip.
 *
 * "consent_off" is intentionally NOT a state. Per the comment in
 * `get-or-compute.ts`, the candidate's own view isn't gated by consent
 * — `getPracticeFit` returns the result regardless of the candidate's
 * consent setting. So the placeholder never fires for that reason on
 * candidate-side surfaces.
 */
export type PlaceholderReason = "role_mismatch" | "unavailable";

/**
 * Classify why a fit is unavailable, given the candidate's own profile
 * + the job's role category. Both sides run through the canonical role
 * mapper so the legacy job-side enum (`dental_assistant`) lines up
 * with the candidate-side vocabulary (`assistant`).
 */
export function classifyPlaceholderReason(
  candidateDesiredRoles: string[],
  jobRoleCategory: string | null | undefined
): PlaceholderReason {
  // Candidate hasn't told us their preferences yet — we can't know
  // whether this is a mismatch, so default to generic.
  if (candidateDesiredRoles.length === 0) return "unavailable";
  const canonicalJob = canonicalizeRoleCategory(jobRoleCategory);
  // "other" jobs aren't filtered by the role-as-filter rule (per
  // canonicalize-role.ts comments), so a missing fit on an "other"
  // job is genuinely no-data, not a role mismatch.
  if (canonicalJob === "other") return "unavailable";
  const candidateCanonical = new Set(
    candidateDesiredRoles.map(canonicalizeRoleCategory)
  );
  if (!candidateCanonical.has(canonicalJob)) return "role_mismatch";
  return "unavailable";
}

interface PracticeFitPlaceholderProps {
  reason?: PlaceholderReason;
}

export function PracticeFitPlaceholder({
  reason = "unavailable",
}: PracticeFitPlaceholderProps) {
  const label = reason === "role_mismatch" ? "Different role" : "Fit · —";
  const tooltip =
    reason === "role_mismatch"
      ? "This role isn't in your role preferences, so PracticeFit can't compare it. Update your preferred roles in your profile if your goals have changed."
      : "PracticeFit isn't ready for this pair yet. Add more to your profile to give us more to work with, or check back in a moment.";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
      title={tooltip}
    >
      <Sparkles className="size-3" />
      {label}
    </span>
  );
}
