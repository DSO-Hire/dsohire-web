/**
 * Employer-facing notification event catalog (Phase 4.5.c).
 *
 * Sibling of `candidate-events.ts` — same shape, different audience.
 * The dispatcher (`./dispatcher.ts`) reads `notification_preferences`
 * for ANY auth user; this catalog defines what the employer-side
 * Settings UI exposes as toggleable events.
 *
 * Events split across what's actively firing today (`shipped: true`)
 * versus placeholder rows for events that downstream phases will start
 * emitting (`shipped: false`). Building the toggle ahead of the emitter
 * is intentional — the preference row is created when the user first
 * toggles, and the dispatcher already honors it the moment the future
 * emitter lands.
 *
 * Keep `event_kind` strings stable — they're persisted to
 * `notification_preferences.event_kind` (text). Renaming a kind orphans
 * every existing preference row.
 */

export interface EmployerNotificationEvent {
  /** Stable string key — what's stored in `notification_preferences`. */
  event_kind: string;
  /** Section label in the UI (groups events visually). */
  group: "Pipeline" | "Team" | "Performance" | "Account" | "Updates";
  /** Toggle title. */
  title: string;
  /** One-line subtitle under the title. */
  description: string;
  /** Channels exposed in the matrix. v1: email + in_app. SMS deferred. */
  channels: ReadonlyArray<"email" | "in_app">;
  /**
   * Transactional events that always fire regardless of the toggle. We
   * still surface the toggle for transparency but visually disable it.
   * The transactional bypass is enforced at the dispatcher level via
   * ALWAYS_DISPATCH_EVENTS — keep the lists in sync.
   */
  forced?: boolean;
  /**
   * Whether the underlying emitter has shipped. UI shows a "Coming soon"
   * pill on rows that won't fire yet, but the preference still saves
   * so it's honored when the emitter lands.
   */
  shipped: boolean;
}

export const EMPLOYER_NOTIFICATION_EVENTS: ReadonlyArray<EmployerNotificationEvent> =
  [
    {
      event_kind: "employer.new_application",
      group: "Pipeline",
      title: "New application",
      description:
        "A candidate applied to one of your jobs. Includes their cover letter and resume preview.",
      channels: ["email", "in_app"],
      shipped: true,
    },
    {
      event_kind: "application.message_received",
      group: "Pipeline",
      title: "Candidate replied",
      description:
        "A candidate sent you a direct message in the application thread.",
      channels: ["email", "in_app"],
      shipped: true,
    },
    {
      event_kind: "employer.application_stage_changed",
      group: "Pipeline",
      title: "Application moved",
      description:
        "When a teammate advances or rejects an application you're watching. Quiet by default.",
      channels: ["email", "in_app"],
      shipped: false,
    },
    {
      event_kind: "employer.application_withdrawn",
      group: "Pipeline",
      title: "Candidate withdrew",
      description:
        "A candidate withdrew from a job you're hiring for. Optional reason included.",
      channels: ["email", "in_app"],
      shipped: false,
    },
    {
      event_kind: "employer.application_stuck",
      group: "Pipeline",
      title: "Stuck candidate alert",
      description:
        "When an application sits in 'New' longer than your team's SLA threshold.",
      channels: ["email", "in_app"],
      shipped: false,
    },
    {
      event_kind: "employer.comment_mention",
      group: "Team",
      title: "@-mentioned in a comment",
      description:
        "A teammate tagged you in an internal comment on an application.",
      channels: ["email", "in_app"],
      shipped: true,
    },
    {
      event_kind: "employer.team_invite",
      group: "Team",
      title: "Team invitations",
      description:
        "Sent to invitees so they can accept their invitation. Always on — required to receive an invite.",
      channels: ["email"],
      forced: true,
      shipped: true,
    },
    {
      event_kind: "employer.weekly_digest",
      group: "Performance",
      title: "Weekly hiring digest",
      description:
        "A Monday-morning summary of the week — applications, stage transitions, top jobs.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "employer.candidate_traffic_milestone",
      group: "Performance",
      title: "Job traffic milestones",
      description:
        "When a job hits 25, 50, 100 applicants — useful nudges for closing.",
      channels: ["email", "in_app"],
      shipped: false,
    },
    {
      event_kind: "account.security_alert",
      group: "Account",
      title: "Security alerts",
      description:
        "New-device sign-ins, role changes on your account, password updates. We recommend keeping these on.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "billing.payment_event",
      group: "Account",
      title: "Billing & subscription",
      description:
        "Payment receipts, failed charges, subscription tier changes, renewal reminders.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "marketing.product_updates",
      group: "Updates",
      title: "Product updates",
      description:
        "Occasional emails when DSO Hire ships features that affect your workflow.",
      channels: ["email"],
      shipped: false,
    },
    {
      event_kind: "marketing.industry_insights",
      group: "Updates",
      title: "Dental hiring insights",
      description:
        "Quarterly benchmarks — salary trends, time-to-hire data, regional supply/demand.",
      channels: ["email"],
      shipped: false,
    },
  ];

/** Sensible defaults for an employer who hasn't visited the settings tab. */
export const EMPLOYER_NOTIFICATION_DEFAULTS: Record<
  string,
  Record<string, boolean>
> = {
  "employer.new_application": { email: true, in_app: true },
  "application.message_received": { email: true, in_app: true },
  "employer.application_stage_changed": { email: false, in_app: true },
  "employer.application_withdrawn": { email: true, in_app: true },
  "employer.application_stuck": { email: true, in_app: true },
  "employer.comment_mention": { email: true, in_app: true },
  "employer.team_invite": { email: true },
  "employer.weekly_digest": { email: true },
  "employer.candidate_traffic_milestone": { email: true, in_app: true },
  "account.security_alert": { email: true },
  "billing.payment_event": { email: true },
  "marketing.product_updates": { email: true },
  "marketing.industry_insights": { email: false },
};

/** Order events show up in the UI matrix. Groups in this order. */
export const EMPLOYER_NOTIFICATION_GROUP_ORDER: ReadonlyArray<
  EmployerNotificationEvent["group"]
> = ["Pipeline", "Team", "Performance", "Account", "Updates"];
