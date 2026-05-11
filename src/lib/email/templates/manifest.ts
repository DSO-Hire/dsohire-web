/**
 * Email template manifest (Phase 4.5.f).
 *
 * Defines:
 *   - Which templates are customizable (`TEMPLATE_KINDS`)
 *   - The mergefield variables available to each template
 *   - Display metadata for the editor (label, description)
 *
 * The renderer (`./renderer.ts`) and loader (`./loader.ts`) consume this
 * file. The editor surface reads the same manifest so what shows up in
 * the "Insert variable" dropdown matches what the renderer accepts.
 *
 * To add a new template:
 *   1. Add the kind to email_template_kind enum (migration)
 *   2. Add an entry below
 *   3. Add a default subject + body in `./defaults.ts`
 *   4. Wire dispatch path to look it up before sending
 */

export type EmailTemplateKind =
  | "candidate.application_received"
  | "application.message_received"
  | "candidate.stage_changed";

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
  kind: EmailTemplateKind;
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
      example: "Eslinger Family Dental — Indianapolis",
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
    { token: "dso.name", label: "DSO name", example: "Eslinger Dental" },
    {
      token: "dso.profile_url",
      label: "Public profile URL",
      example: "https://dsohire.com/companies/eslinger",
    },
    {
      token: "dso.contact_cta_url",
      label: "Contact CTA URL",
      example: "mailto:careers@eslinger.com",
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
 * Per-template meta
 * ─────────────────────────────────────────────────────────── */

export const TEMPLATE_META: Record<EmailTemplateKind, TemplateMeta> = {
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
      "Sent to a candidate when their application changes stage (e.g. Reviewed → Interview, or moved to Rejected). Dispatch path wires up in a follow-up.",
    audience: "candidate",
    dispatchWired: false,
    groups: [CANDIDATE_GROUP, JOB_GROUP, DSO_GROUP, STAGE_GROUP],
  },
};

export const TEMPLATE_KINDS: EmailTemplateKind[] = [
  "candidate.application_received",
  "application.message_received",
  "candidate.stage_changed",
];

/** All valid token strings across all templates. Used by the renderer's allowlist. */
export function tokensForKind(kind: EmailTemplateKind): Set<string> {
  return new Set(
    TEMPLATE_META[kind].groups.flatMap((g) => g.fields.map((f) => f.token))
  );
}
