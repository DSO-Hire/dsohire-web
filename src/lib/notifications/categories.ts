/**
 * Unsubscribe categories (Phase E8.14 — CAN-SPAM / RFC 8058 compliance).
 *
 * The notification system already stores fine-grained preferences per
 * (user_id, event_kind, channel) in `notification_preferences`, surfaced in
 * the logged-in Settings UIs. But CAN-SPAM requires that *commercial* email
 * carry a working opt-out that does NOT require logging in, and Gmail/Yahoo's
 * bulk-sender rules require one-click unsubscribe via the List-Unsubscribe
 * headers (RFC 8058). This module groups the underlying event kinds into a
 * small set of human-meaningful CATEGORIES that an out-of-session recipient
 * can opt out of with a single click.
 *
 * Which categories are "commercial":
 *   - Only recurring / promotional / relationship-marketing streams get a hard
 *     unsubscribe (digests, product updates, insights, job alerts, newsletter,
 *     surveys). These set `commercial: true`.
 *   - Pure transactional mail (application receipts, direct messages, team
 *     invites, security + billing notices) is exempt under CAN-SPAM and is
 *     intentionally NOT represented here — you can't "unsubscribe" from the
 *     receipt for an action you just took. Those emails get a soft, logged-in
 *     "manage preferences" link instead, never a List-Unsubscribe header.
 *
 * The category `key` is a STABLE identifier embedded in signed unsubscribe
 * tokens — never rename one, or existing links in already-delivered mail break.
 */

export type NotificationAudience = "employer" | "candidate";

export interface UnsubscribeCategory {
  /** Stable key embedded in signed unsubscribe tokens. Never rename. */
  key: string;
  audience: NotificationAudience;
  /** Human label shown on the public unsubscribe page + in email footers. */
  label: string;
  /** One-line description for the public confirmation page. */
  description: string;
  /**
   * Event kinds whose EMAIL channel this category controls. Opting out flips
   * `notification_preferences.email = false` for every kind listed here.
   */
  eventKinds: ReadonlyArray<string>;
  /**
   * Commercial / promotional stream → gets a List-Unsubscribe header + a
   * visible unsubscribe footer link. All categories here are commercial today;
   * the flag is explicit so a future transactional grouping can't accidentally
   * inherit a hard unsubscribe.
   */
  commercial: boolean;
}

export const UNSUBSCRIBE_CATEGORIES: ReadonlyArray<UnsubscribeCategory> = [
  // ---- Employer ----
  {
    key: "employer.performance",
    audience: "employer",
    label: "Performance summaries",
    description:
      "Weekly hiring digests and job-traffic milestone nudges for your DSO.",
    eventKinds: ["employer.weekly_digest", "employer.candidate_traffic_milestone"],
    commercial: true,
  },
  {
    key: "employer.updates",
    audience: "employer",
    label: "Product updates & dental hiring insights",
    description:
      "Occasional product announcements and quarterly dental hiring benchmarks.",
    eventKinds: ["marketing.product_updates", "marketing.industry_insights"],
    commercial: true,
  },
  // ---- Candidate ----
  {
    key: "candidate.jobs",
    audience: "candidate",
    label: "Job alerts & recommendations",
    description:
      "Saved-search matches and recommended jobs based on your profile.",
    eventKinds: ["job_alert.match", "job_alert.recommended"],
    commercial: true,
  },
  {
    key: "candidate.updates",
    audience: "candidate",
    label: "Newsletter & surveys",
    description:
      "The DSO Hire newsletter and occasional product feedback surveys.",
    eventKinds: ["marketing.newsletter", "marketing.surveys"],
    commercial: true,
  },
];

const CATEGORY_BY_KEY: ReadonlyMap<string, UnsubscribeCategory> = new Map(
  UNSUBSCRIBE_CATEGORIES.map((c) => [c.key, c])
);

/** Reverse map: event_kind → the commercial category that owns it (if any). */
const CATEGORY_BY_EVENT_KIND: ReadonlyMap<string, UnsubscribeCategory> = new Map(
  UNSUBSCRIBE_CATEGORIES.flatMap((c) =>
    c.eventKinds.map((ek) => [ek, c] as const)
  )
);

export function getUnsubscribeCategory(
  key: string
): UnsubscribeCategory | null {
  return CATEGORY_BY_KEY.get(key) ?? null;
}

/**
 * The commercial category that owns an event kind, or null if the event is
 * transactional (no hard unsubscribe). Used by the dispatcher to decide
 * whether to attach List-Unsubscribe headers.
 */
export function categoryForEventKind(
  eventKind: string
): UnsubscribeCategory | null {
  return CATEGORY_BY_EVENT_KIND.get(eventKind) ?? null;
}

/** True when an event kind belongs to a commercial (unsubscribable) stream. */
export function isCommercialEvent(eventKind: string): boolean {
  const cat = CATEGORY_BY_EVENT_KIND.get(eventKind);
  return Boolean(cat?.commercial);
}
