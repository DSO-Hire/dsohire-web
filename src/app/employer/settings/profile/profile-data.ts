/**
 * /employer/settings/profile — non-server module for shared types + constants.
 *
 * Lives separately from actions.ts so a "use server" file only exports
 * async functions. (See feedback_use_server_only_async.md — co-locating
 * data with actions breaks at client runtime.)
 *
 * Shape mirrors what the page loader returns and what the editor cards
 * consume.
 */

export interface WhyJoinUsBlock {
  title: string;
  body: string;
}

export interface ProfilePhoto {
  id: string;
  storage_url: string;
  caption: string | null;
  sort_order: number;
}

export interface ProfileData {
  /** Stable identity (read-only) */
  dso_id: string;
  name: string;

  /** Editable */
  slug: string;
  mission: string | null;
  description: string | null; // Tiptap HTML
  logo_url: string | null;
  banner_url: string | null;
  brand_color: string | null;
  why_join_us: WhyJoinUsBlock[];
  culture_chips: string[];
  contact_cta_label: string | null;
  contact_cta_url: string | null;

  /** Company details (website + HQ + size). Columns already existed and
   *  render on the public profile; the editor exposes them as of 2026-05-22
   *  (Dave call Note 7 — DSOs need a place to add their website + info). */
  website: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  candidate_reply_to_email: string | null;
  practice_count: number | null;

  /** PracticeFit v3 practice profile — the culture mirror (Phase B.1).
   *  All optional; blanks leave the matching dimension unscored. */
  practice_pace: string | null;
  autonomy_level: string | null;
  mentorship_offered: string | null;
  practice_feel: string | null;
  ce_support: number | null;
  work_life_balance: number | null;
  practice_profile_completed_at: string | null;

  /** Photo gallery (separate table) */
  photos: ProfilePhoto[];
}

/* PracticeFit practice-profile option metadata — shared by the editor.
 * Values mirror the candidate assessment columns so the engine compares
 * directly. */
export const PRACTICE_PACE_OPTIONS = [
  { value: "high_volume", label: "High-volume, fast-moving" },
  { value: "steady", label: "Steady and balanced" },
  { value: "thorough", label: "Unhurried and thorough" },
] as const;

export const AUTONOMY_LEVEL_OPTIONS = [
  { value: "autonomy", label: "High autonomy — providers run their own chair/desk" },
  { value: "balance", label: "A balance of autonomy and support" },
  { value: "structure", label: "Clear protocols and close support" },
] as const;

export const MENTORSHIP_OPTIONS = [
  { value: "strong", label: "Strong mentorship + coaching" },
  { value: "occasional", label: "Occasional guidance" },
  { value: "independent", label: "Full independence" },
] as const;

export const PRACTICE_FEEL_OPTIONS = [
  { value: "private", label: "Tight-knit, private-practice feel" },
  { value: "midsize", label: "Mid-size, collaborative group" },
  { value: "large", label: "Large team with lots of resources" },
] as const;

/** Length limits surfaced in the UI; mirrors action-layer validation. */
export const PROFILE_LIMITS = {
  MISSION_MAX: 400,
  WHY_BLOCK_TITLE_MAX: 80,
  WHY_BLOCK_BODY_MAX: 600,
  WHY_BLOCKS_MAX: 6,
  CTA_LABEL_MAX: 80,
  PHOTOS_MAX: 6,
  WEBSITE_MAX: 200,
  HQ_CITY_MAX: 80,
  HQ_STATE_MAX: 60,
  PRACTICE_COUNT_MAX: 100000,
} as const;
