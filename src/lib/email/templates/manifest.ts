/**
 * Email template manifest.
 *
 * Defines:
 *   - The 3 system-predefined template kinds (`PREDEFINED_TEMPLATE_KINDS`)
 *   - The mergefield variables available to each predefined template
 *   - The mergefield groups available to user-defined custom templates
 *     (`CUSTOM_TEMPLATE_GROUPS`) — picker for the candidate-detail
 *     "Send custom email" surface.
 *   - Display metadata for the editor (label, description)
 *
 * The renderer (`./renderer.ts`) and predefined-template loader
 * (`./loader.ts`) consume this file. The custom-template loader
 * (`./custom-loader.ts`) uses `CUSTOM_TEMPLATE_GROUPS` to validate +
 * render arbitrary user-defined kinds.
 *
 * Schema note (2026-05-26): `email_templates.kind` was widened from enum
 * to text so DSOs on Growth+ can author arbitrary template kinds beyond
 * the 3 predefined. Predefined kinds remain string-equal to the
 * `PredefinedTemplateKind` literals below.
 *
 * To add a new PREDEFINED template:
 *   1. Add the literal to PredefinedTemplateKind below
 *   2. Add an entry to TEMPLATE_META
 *   3. Add a default subject + body in `./defaults.ts`
 *   4. Wire dispatch path to look it up before sending
 *
 * To add a new CUSTOM template — done by users in the editor at runtime.
 * No code changes required.
 */

/**
 * The 3 system-predefined template kinds. These are the only kinds with
 * an automatic dispatch path; custom user-defined kinds are sent on
 * demand from the application detail surface.
 */
export type PredefinedTemplateKind =
  | "candidate.application_received"
  | "application.message_received"
  | "candidate.stage_changed";

/**
 * Any template kind — predefined string literal OR a user-defined slug
 * (e.g. "custom.interview-no-show-followup"). The DB column is plain
 * text so this is just a string alias.
 */
export type EmailTemplateKind = string;

/** Namespace prefix for user-defined custom kinds. */
export const CUSTOM_KIND_PREFIX = "custom.";

export interface MergefieldDef {
  /** Token the editor inserts and the renderer matches. e.g. "candidate.first_name" */
  token: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Sample value used in the live preview. */
  example: string;
}

export interface MergefieldGroup {
  id: string;
  label: string;
  fields: MergefieldDef[];
}

export interface TemplateMeta {
  kind: PredefinedTemplateKind;
  label: string;
  description: string;
  /** Direction of travel for editor copy ("Sent to candidate after..." etc.) */
  audience: "candidate" | "employer";
  /** True once dispatch path is wired. Editor still works either way; just
   *  shows a "Not yet sent automatically" banner when false. */
  dispatchWired: boolean;
  groups: MergefieldGroup[];
}

/* ──────────────────────────────────────────────────────────────
 * Shared mergefield groups
 * ─────────────────────────────────────────────────────────── */

const CANDIDATE_GROUP: MergefieldGroup = {
  id: "candidate",
  label: "Candidate",
  fields: [
    { token: "candidate.first_name", label: "First name", example: "Sarah" },
    { token: "candidate.full_name", label: "Full name", example: "Sarah Chen" },
    { token: "candidate.email", label: "Email", example: "sarah.chen@example.com" },
  ],
};

const JOB_GROUP: MergefieldGroup = {
  id: "job",
  label: "Job",
  fields: [
    { token: "job.title", label: "Job title", example: "Lead Hygienist" },
    {
      token: "job.location_name",
      label: "Practice location",
      example: "Lakeshore Dental Group — Indianapolis",
    },
    {
      token: "job.url",
      label: "Public job URL",
      example: "https://dsohire.com/jobs/sample-id",
    },
  ],
};

const DSO_GROUP: MergefieldGroup = {
  id: "dso",
  label: "DSO",
  fields: [
    { token: "dso.name", label: "DSO name", example: "Lakeshore Dental Group" },
    {
      token: "dso.profile_url",
      label: "Public profile URL",
      example: "https://dsohire.com/companies/lakeshore",
    },
    {
      token: "dso.contact_cta_url",
      label: "Contact CTA URL",
      example: "mailto:careers@lakeshoredental.com",
    },
  ],
};

const STAGE_GROUP: MergefieldGroup = {
  id: "stage",
  label: "Stage",
  fields: [
    {
      token: "stage.from_label",
      label: "Previous stage",
      example: "New",
    },
    { token: "stage.to_label", label: "New stage", example: "Interview" },
  ],
};

const MESSAGE_GROUP: MergefieldGroup = {
  id: "message",
  label: "Message",
  fields: [
    {
      token: "message.preview",
      label: "Message preview",
      example: "Thanks for applying — we'd love to set up a quick call.",
    },
    {
      token: "message.thread_url",
      label: "Thread URL",
      example: "https://dsohire.com/candidate/applications/sample-id",
    },
  ],
};

/* ──────────────────────────────────────────────────────────────
 * Per-template meta (PREDEFINED only)
 * ─────────────────────────────────────────────────────────── */

export const TEMPLATE_META: Record<PredefinedTemplateKind, TemplateMeta> = {
  "candidate.application_received": {
    kind: "candidate.application_received",
    label: "Application received",
    description:
      "Sent to a candidate immediately after they submit an application. Confirms receipt and sets expectations.",
    audience: "candidate",
    dispatchWired: true,
    groups: [CANDIDATE_GROUP, JOB_GROUP, DSO_GROUP],
  },
  "application.message_received": {
    kind: "application.message_received",
    label: "Message received",
    description:
      "Sent to a candidate when an employer replies in their application thread.",
    audience: "candidate",
    dispatchWired: true,
    groups: [CANDIDATE_GROUP, JOB_GROUP, DSO_GROUP, MESSAGE_GROUP],
  },
  "candidate.stage_changed": {
    kind: "candidate.stage_changed",
    label: "Stage moved",
    description:
      "Sent to a candidate when their application changes stage (e.g. Reviewed → Interview, or moved to Rejected).",
    audience: "candidate",
    dispatchWired: true,
    groups: [CANDIDATE_GROUP, JOB_GROUP, DSO_GROUP, STAGE_GROUP],
  },
};

export const PREDEFINED_TEMPLATE_KINDS: PredefinedTemplateKind[] = [
  "candidate.application_received",
  "application.message_received",
  "candidate.stage_changed",
];

/**
 * Legacy alias — earlier code paths import `TEMPLATE_KINDS`. Maintained
 * here so existing call sites compile while the codebase migrates to the
 * new naming. Future work: rename callers, drop this alias.
 */
export const TEMPLATE_KINDS: PredefinedTemplateKind[] = PREDEFINED_TEMPLATE_KINDS;

/* ──────────────────────────────────────────────────────────────
 * Custom-template mergefield surface
 *
 * User-defined templates are sent on demand from an application detail
 * surface (not from an automatic dispatch path), so the available context
 * is always: the candidate + their job + the DSO sending the email.
 * Stage / message context is event-kind-specific and not surfaced here.
 * ─────────────────────────────────────────────────────────── */

export const CUSTOM_TEMPLATE_GROUPS: MergefieldGroup[] = [
  CANDIDATE_GROUP,
  JOB_GROUP,
  DSO_GROUP,
];

/** Token allowlist for custom templates — used by the renderer when no
 *  predefined meta exists for the kind. */
export function tokensForCustomTemplate(): Set<string> {
  return new Set(
    CUSTOM_TEMPLATE_GROUPS.flatMap((g) => g.fields.map((f) => f.token))
  );
}

/** True iff the kind matches one of the predefined literals. */
export function isPredefinedKind(kind: string): kind is PredefinedTemplateKind {
  return (PREDEFINED_TEMPLATE_KINDS as string[]).includes(kind);
}

/**
 * All valid token strings across all groups available to this kind.
 * For predefined kinds returns the kind-specific group tokens; for
 * anything else returns the custom-template token set. Used by the
 * renderer's allowlist enforcement.
 */
export function tokensForKind(kind: string): Set<string> {
  if (isPredefinedKind(kind)) {
    return new Set(
      TEMPLATE_META[kind].groups.flatMap((g) => g.fields.map((f) => f.token))
    );
  }
  return tokensForCustomTemplate();
}

/**
 * Returns the merge groups available for any kind — predefined-meta groups
 * for known kinds, the custom-template groups otherwise. The editor and
 * the "Send custom email" picker both consume this.
 */
export function groupsForKind(kind: string): MergefieldGroup[] {
  if (isPredefinedKind(kind)) {
    return TEMPLATE_META[kind].groups;
  }
  return CUSTOM_TEMPLATE_GROUPS;
}
