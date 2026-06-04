/**
 * Per-event-kind, per-channel default preferences (Phase 4.1.b).
 *
 * The dispatcher reads from `notification_preferences` first; only
 * falls back to this map when no row exists for the (user, event_kind,
 * channel) tuple. That means the defaults serve a brand-new account
 * AND any user who hasn't visited a Settings page yet.
 *
 * Keep these conservative — for any event the candidate or employer
 * cares about, default ON. For nice-to-have or noisy events, default
 * OFF and let the user opt in.
 */

import type {
  NotificationChannel,
  NotificationEventKind,
  NotificationFrequency,
} from "./types";

export interface PreferenceDefault {
  enabled: boolean;
  frequency: NotificationFrequency;
}

type DefaultsMap = Record<
  NotificationEventKind,
  Record<NotificationChannel, PreferenceDefault>
>;

/**
 * Defaults rationale per row:
 *
 * • candidate.application_received — instant email is the receipt; this
 *   IS the value of having an account. Always on.
 * • application.message_received — direct human-to-human comm; default
 *   instant email. SMS off by default until 4.3.c phone-capture is wired.
 * • employer.new_application — table-stakes. Default instant on email.
 *   Daily digest becomes available in 4.3 + 4.5 settings UIs.
 * • employer.team_invite — one-off transactional. Always sent regardless
 *   of preference (transactional, not promotional). The default still
 *   marks it enabled for completeness.
 * • employer.comment_mention — instant email matches the working pattern.
 *
 * Frequency: 'instant' = send immediately. 'daily_digest' / 'weekly_digest'
 * are reserved for the future digest scheduler — until that ships, the
 * dispatcher logs them as `suppressed_by_cap` so we don't drop emails
 * silently. v1 only emits 'instant' or 'off'.
 */
export const NOTIFICATION_DEFAULTS: DefaultsMap = {
  "candidate.application_received": {
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "application.message_received": {
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "candidate.stage_changed": {
    // Editor exists in 4.5.f; dispatch wiring lands later. Default ON so
    // when the wiring lands, candidates get notified by default.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "candidate.nurture": {
    // Employer-initiated message about the candidate's own application —
    // relationship/transactional, default on.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "candidate.practice_fit_digest": {
    // B.2 weekly drip. The cron IS the scheduler, so the default frequency is
    // 'instant' (send when invoked) — NOT 'weekly_digest', which the dispatcher
    // would treat as "defer to a future digest scheduler" and suppress_by_cap.
    // Default ON (a valuable, opt-out job-alert stream); one-click unsubscribe
    // via the candidate.jobs category flips email=false → dispatcher suppresses.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: false, frequency: "off" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.new_application": {
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.team_invite": {
    // Transactional — never suppressed by preference even if disabled.
    // Default still 'enabled: true' for honesty in any future "preview
    // your settings" surface.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: false, frequency: "off" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.comment_mention": {
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: true, frequency: "instant" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.automation_notice": {
    // An admin explicitly built a rule to notify this teammate, so it sends
    // regardless of personal prefs (also listed in ALWAYS_DISPATCH_EVENTS).
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: false, frequency: "off" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.offer_approval": {
    // A teammate needs sign-off to send an offer — a workflow gate, not a
    // personal preference. Always-dispatch so an approver never misses it.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: false, frequency: "off" },
    sms: { enabled: false, frequency: "off" },
  },
  "employer.offer_approval_decision": {
    // The sender is told their pending offer was approved or rejected.
    email: { enabled: true, frequency: "instant" },
    in_app: { enabled: false, frequency: "off" },
    sms: { enabled: false, frequency: "off" },
  },
};

/**
 * Events that bypass user prefs entirely (transactional / security /
 * legal). The dispatcher checks this set before consulting the prefs
 * table — these events ALWAYS dispatch even if the user toggled
 * everything off.
 *
 * Examples we'd add later: password resets, security alerts, payment
 * receipts, account deletion confirmations, legal notices.
 */
export const ALWAYS_DISPATCH_EVENTS: ReadonlySet<NotificationEventKind> =
  new Set<NotificationEventKind>([
    "employer.team_invite", // can't accept an invite without the email
    "employer.automation_notice", // admin-configured automation; not a personal pref
    "employer.offer_approval", // approval gate — an approver must always be told
    "employer.offer_approval_decision", // the sender must learn the outcome
  ]);
