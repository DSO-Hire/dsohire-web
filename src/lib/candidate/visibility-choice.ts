/**
 * Consent-based candidate privacy (Option 3) — the pure mapping from the
 * first-run visibility CHOICE the candidate taps to the (cv_visibility,
 * anonymous_mode) row state we persist.
 *
 * Kept in its own non-"use server" module so it can be unit-tested and reused
 * (the server action in app/candidate/welcome/visibility/actions.ts imports it;
 * a "use server" file may only export async functions, so the literal map can't
 * live there).
 *
 * Invariants the test guards:
 *   - "private" is the ONLY choice that yields a hidden (non-discoverable) row.
 *   - "anonymous" is discoverable but masked (anonymous_mode = true).
 *   - the two discoverable choices both use 'recruiters_only' (findable, not
 *     boosted) — never 'open_to_work', which is the candidate's later explicit
 *     "actively interviewing" upgrade in Settings.
 */

export type VisibilityChoice = "private" | "discoverable" | "anonymous";

export interface VisibilityState {
  cv_visibility: "hidden" | "recruiters_only";
  anonymous_mode: boolean;
}

export const VISIBILITY_CHOICE_MAP: Readonly<
  Record<VisibilityChoice, VisibilityState>
> = {
  private: { cv_visibility: "hidden", anonymous_mode: false },
  discoverable: { cv_visibility: "recruiters_only", anonymous_mode: false },
  anonymous: { cv_visibility: "recruiters_only", anonymous_mode: true },
};

/** Map a first-run choice to the row state, or null if the choice is unknown. */
export function mapVisibilityChoice(
  choice: string
): VisibilityState | null {
  return (
    VISIBILITY_CHOICE_MAP[choice as VisibilityChoice] ?? null
  );
}
