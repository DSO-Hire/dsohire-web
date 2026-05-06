/**
 * Notification orchestration — shared types (Phase 4.1.b).
 *
 * The dispatcher (`./dispatcher.ts`) consumes these. Defaults map
 * (`./defaults.ts`) is keyed by them. Future Settings UIs (Phase 4.3.b
 * candidate notifications + Phase 4.5.b employer notifications) read
 * from the same enums so the toggle table is exhaustive.
 *
 * Server-only types — the union is referenced from server actions and
 * a small typed view of the prefs table. The DB column is `text`, not
 * an enum, so adding a new event kind is a code-only change.
 */

/**
 * Whitelisted notification event kinds. Add a new entry whenever a new
 * surface needs to send mail; the defaults map (`./defaults.ts`) MUST
 * be updated in the same change so the dispatcher knows what to do
 * when a user has no row in `notification_preferences`.
 */
export type NotificationEventKind =
  // Candidate-facing
  | "candidate.application_received"        // apply confirmation
  | "application.message_received"          // DM from employer
  // Employer-facing (per-DSO-member)
  | "employer.new_application"              // candidate applied to a job
  | "employer.team_invite"                  // teammate invitation
  | "employer.comment_mention";             // @-mentioned in a comment

export type NotificationChannel = "email" | "in_app" | "sms";

export type NotificationFrequency =
  | "instant"
  | "daily_digest"
  | "weekly_digest"
  | "off";

/**
 * Status logged on every dispatchNotification() call. Mirrors the
 * `notification_dispatch_log.status` CHECK constraint.
 */
export type NotificationDispatchStatus =
  | "sent"
  | "failed"
  | "suppressed_by_pref"     // user prefs disabled this event/channel
  | "suppressed_by_cap"      // future: frequency cap (rate limit)
  | "suppressed_by_template"; // future: no template registered for kind/channel

/**
 * Stable label used for analytics / debugging. Keep human-readable.
 */
export const EVENT_KIND_LABELS: Record<NotificationEventKind, string> = {
  "candidate.application_received": "Application confirmation",
  "application.message_received": "New message",
  "employer.new_application": "New application",
  "employer.team_invite": "Team invitation",
  "employer.comment_mention": "Comment @-mention",
};
