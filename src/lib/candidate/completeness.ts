/**
 * Profile completeness scoring (Phase 4.2.c).
 *
 * LinkedIn's All-Star analog. Five tiers, nine specific checks. Used by
 * `<CompletenessMeter>` on /candidate/profile to surface a pill-style
 * indicator + a list of named missing-items with one-click CTAs.
 *
 * Per locked rule R6 (parity sprint scope §2.B): the meter is a CTA,
 * never a shame state. Empty fields read as "here's what to add next,"
 * not "you're failing." Copy + visuals are gentle.
 *
 * Locked thresholds (from scope §4.2.c):
 *   • All-Star = photo + headline + summary ≥100 chars + current
 *     location + ≥1 work entry + ≥1 license + ≥3 skills + ≥1 language
 *     + Job Preferences set.
 *
 * Pure module — no React, no DB. Server and client can both import.
 */

import type { ProfileData } from "@/app/candidate/profile/profile-sections";

export type CompletenessTier =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert"
  | "all_star";

export interface CompletenessItem {
  key:
    | "photo"
    | "headline"
    | "summary"
    | "location"
    | "work"
    | "license"
    | "skills"
    | "language"
    | "job_prefs";
  label: string;
  /** Where the "Add now" CTA should send the candidate. */
  ctaTarget:
    | { kind: "modal"; modal: ProfileSectionModal }
    | { kind: "scroll"; selector: string };
  done: boolean;
}

/** Modal identifiers the meter can request — must match orchestrator types. */
export type ProfileSectionModal =
  | { kind: "identity" }
  | { kind: "rolePreferences" }
  | { kind: "skillsLanguages" }
  | { kind: "jobPreferences" }
  | { kind: "workHistory"; entryId: null }
  | { kind: "license"; entryId: null };

export interface CompletenessReport {
  tier: CompletenessTier;
  /** 0-9. Number of items in `items` with `done = true`. */
  score: number;
  /** Always 9 in v1; expose as a field so future expansions don't fork the UI. */
  total: number;
  items: CompletenessItem[];
  /** Convenience accessor — items where done === false. */
  missing: CompletenessItem[];
}

const SUMMARY_MIN_CHARS = 100;
const SKILLS_MIN_COUNT = 3;

export function computeCompleteness(
  data: ProfileData,
  photoUrl: string | null
): CompletenessReport {
  const items: CompletenessItem[] = [
    {
      key: "photo",
      label: "Add a profile photo",
      ctaTarget: { kind: "scroll", selector: "#profile-photo" },
      done: Boolean(photoUrl),
    },
    {
      key: "headline",
      label: "Write a one-line headline",
      ctaTarget: { kind: "modal", modal: { kind: "identity" } },
      done: Boolean(data.identity.headline?.trim()),
    },
    {
      key: "summary",
      label: `Write a short summary (at least ${SUMMARY_MIN_CHARS} characters)`,
      ctaTarget: { kind: "modal", modal: { kind: "identity" } },
      done: (data.identity.summary?.trim().length ?? 0) >= SUMMARY_MIN_CHARS,
    },
    {
      key: "location",
      label: "Add your current location",
      ctaTarget: { kind: "modal", modal: { kind: "identity" } },
      done: Boolean(
        data.identity.current_location_city &&
          data.identity.current_location_state
      ),
    },
    {
      key: "work",
      label: "Add at least one work history entry",
      ctaTarget: { kind: "modal", modal: { kind: "workHistory", entryId: null } },
      done: data.workHistory.length >= 1,
    },
    {
      key: "license",
      label: "Add at least one license",
      ctaTarget: { kind: "modal", modal: { kind: "license", entryId: null } },
      done: data.licenses.length >= 1,
    },
    {
      key: "skills",
      label: `Add at least ${SKILLS_MIN_COUNT} skills`,
      ctaTarget: { kind: "modal", modal: { kind: "skillsLanguages" } },
      done: data.skillsLanguages.skills.length >= SKILLS_MIN_COUNT,
    },
    {
      key: "language",
      label: "Add at least one language",
      ctaTarget: { kind: "modal", modal: { kind: "skillsLanguages" } },
      done: data.skillsLanguages.languages.length >= 1,
    },
    {
      key: "job_prefs",
      label: "Set your job preferences",
      ctaTarget: { kind: "modal", modal: { kind: "jobPreferences" } },
      // Considered "done" once at least one signal is set: locations, salary,
      // any weekday available, or willing-to-relocate.
      done:
        data.jobPreferences.desired_locations.length > 0 ||
        data.jobPreferences.min_salary !== null ||
        Object.values(data.jobPreferences.schedule_preferences).some(Boolean),
    },
  ];

  const score = items.filter((i) => i.done).length;
  const tier = scoreToTier(score);

  return {
    tier,
    score,
    total: items.length,
    items,
    missing: items.filter((i) => !i.done),
  };
}

function scoreToTier(score: number): CompletenessTier {
  // 0-1: just getting started
  // 2-4: shaping up
  // 5-6: real profile
  // 7-8: nearly there
  // 9: All-Star
  if (score <= 1) return "beginner";
  if (score <= 4) return "intermediate";
  if (score <= 6) return "advanced";
  if (score <= 8) return "expert";
  return "all_star";
}

export const TIER_META: Record<
  CompletenessTier,
  { label: string; copy: string; tone: "neutral" | "warm" | "celebrate" }
> = {
  beginner: {
    label: "Just getting started",
    copy: "A few quick wins will help recruiters take you seriously.",
    tone: "neutral",
  },
  intermediate: {
    label: "Shaping up",
    copy: "You're past the basics — keep going to stand out in search.",
    tone: "neutral",
  },
  advanced: {
    label: "Looking good",
    copy: "Solid profile. A few more details unlock priority placement.",
    tone: "warm",
  },
  expert: {
    label: "Almost All-Star",
    copy: "Just a couple of items left — finish strong.",
    tone: "warm",
  },
  all_star: {
    label: "All-Star",
    copy: "Your profile is dialed in. Recruiters love a complete picture.",
    tone: "celebrate",
  },
};
