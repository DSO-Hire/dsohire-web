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
  practice_count: number | null;

  /** Photo gallery (separate table) */
  photos: ProfilePhoto[];
}

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
