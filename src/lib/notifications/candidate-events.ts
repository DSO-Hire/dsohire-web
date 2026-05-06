/**
 * Candidate-facing notification event catalog (Phase 4.3.b).
 *
 * What the user-facing settings UI exposes as toggleable events. Some
 * of these are already firing through the dispatcher (e.g.
 * `application.message_received` shipped in 4.1.b); others are
 * placeholder rows for events that downstream phases will start
 * emitting (`application.stage_changed` once 4.4 ships, `job_alert_match`
 * once 4.3.e ships saved searches, etc.).
 *
 * Building the UI ahead of every emitter is intentional — the
 * preferences row gets created when a candidate first toggles, and
 * the dispatcher already reads from `notification_preferences` with a
 * fallback to NOTIFICATION_DEFAULTS. So when a future emitter starts
 * firing, the candidate's existing preference is already honored.
 *
 * Keep `event_kind` strings stable — they're persisted to
 * `notification_preferences.event_kind` (text). Renaming an event
 * orphans every existing preference row.
 */

export interface CandidateNotificationEvent {
  /** Stable string key — what's stored in `notification_preferences`. */
  event_kind: string;
  /** Section label in the UI (groups events). */
  group: "Applications" | "Jobs" | "Account" | "Updates";
  /** Toggle title. */
  title: string;
  /** One-line subtitle under the title. */
  description: string;
  /** Channels exposed in the matrix. v1: email + in_app. SMS deferred. */
  channels: ReadonlyArray<"email" | "in_app">;
  /**
   * Whether this is a transactional event that always fires regardless
   * of the toggle (we still surface the toggle for transparency, but
   * disable it). Today: none — we keep the transactional bypass at the
   * dispatcher level via ALWAYS_DISPATCH_EVENTS.
   */
  forced?: boolean;
  /**
   * Whether the underlying event emitter has shipped. UI shows a
   * "Coming soon" hint on toggles that won't fire yet, but the
   * preference still saves so it's honored when the emitter lands.
   */
  shipped: boolean;
}

export const CANDIDATE_NOTIFICATION_EVENTS: ReadonlyArray<CandidateNotificationEvent> =
  [
    {
      event_kind: "candidate.application_received",
      group: "Applications",
      title: "Application receipt",
      description:
        "When you submit an application, we send a confirmation so you can track it.",
      channels: ["email", "in_app"],
      shipped: true,
    },
    {
      event_kind: "application.stage_changed",
      group: "Applications",
      title: "Application status updates",
      description:
        "When an employer moves your application forward (interview, offer, etc.).",
      channels: ["email", "in_app"],
      shipped: false,
    },
    {
      event_kind: "application.message_received",
      group: "Applications",
      title: "Messages from employers",
      description:
        "When an employer or recruiter sends you a direct message about an application.",
      channels: ["email", "in_app"],
      shipped: true,
    },
    {
      event_kind: "job_alert.match",
      group: "Jobs",
      title: "Saved search matches",
      description:
        "Email alerts when new jobs match a saved search. Manage searches in Credentials.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "job_alert.recommended",
      group: "Jobs",
      title: "Recommended jobs",
      description:
        "Weekly summary of jobs we think fit your profile. Powered by Practice Fit (coming soon).",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "account.security_alert",
      group: "Account",
      title: "Security alerts",
      description:
        "New device sign-ins or password changes. We recommend keeping these on.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "marketing.newsletter",
      group: "Updates",
      title: "DSO Hire newsletter",
      description:
        "Occasional updates on dental hiring trends, salary data, and product news.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "marketing.surveys",
      group: "Updates",
      title: "Surveys & feedback requests",
      description:
        "Help us shape the product. Short surveys, never sold to anyone.",
      channels: ["email"],
      shipped: false,
    },
  ];

/** Sensible defaults for a candidate who hasn't visited the settings tab yet. */
export const CANDIDATE_NOTIFICATION_DEFAULTS: Record<
  string,
  Record<string, boolean>
> = {
  "candidate.application_received": { email: true, in_app: true },
  "application.stage_changed": { email: true, in_app: true },
  "application.message_received": { email: true, in_app: true },
  "job_alert.match": { email: true },
  "job_alert.recommended": { email: true },
  "account.security_alert": { email: true },
  "marketing.newsletter": { email: false },
  "marketing.surveys": { email: false },
};

/** Order events show up in the UI matrix. Groups in this order. */
export const CANDIDATE_NOTIFICATION_GROUP_ORDER: ReadonlyArray<
  CandidateNotificationEvent["group"]
> = ["Applications", "Jobs", "Account", "Updates"];
