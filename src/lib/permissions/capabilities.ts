/**
 * #83 — granular team permissions: capability model.
 *
 * Two axes, kept separate:
 *   • CAPABILITY (what a teammate can DO) — this file.
 *   • SCOPE (which jobs/locations they can SEE) — location scope already
 *     exists for hiring managers (dso_user_locations); confidential-job
 *     assignment lands in Phase 4.
 *
 * The four roles (owner/admin/recruiter/hiring_manager) are PRESETS: each
 * ships with a default capability set (ROLE_DEFAULTS). An owner/admin can then
 * override individual capabilities per teammate (stored in
 * dso_users.permission_overrides jsonb). The effective permission =
 * preset merged with overrides.
 *
 * PURE module — no server imports — so client editor + server enforcement both
 * import it. Enforcement is always-on (presets apply to everyone); only the
 * EDITOR is tier-gated (Growth+), so Solo teams simply run the presets.
 *
 * Compliance floors that NO override may cross live in NON_OVERRIDABLE +
 * ADMIN_ONLY_CAPABILITIES and are re-checked server-side; see
 * Team_Permissions_Design_2026-06-10.md §5.
 */

export type DsoRole = "owner" | "admin" | "recruiter" | "hiring_manager";

export type Capability =
  // Jobs
  | "jobs.create"
  | "jobs.publish" // publish / pause — consumes the plan's active-openings cap
  | "jobs.edit"
  | "jobs.delete"
  // Candidates & pipeline
  | "apps.view"
  | "apps.move_stage"
  | "apps.scorecard"
  | "apps.message"
  | "apps.reject"
  // Offers
  | "offers.draft"
  | "offers.send_direct" // reconciles with legacy dso_users.can_send_offers_directly (Phase 2)
  | "offers.approve"
  // Sensitive
  | "comp.view"
  | "candidates.export"
  | "eeo.view" // demographic / EEO reports — owner/admin + explicit grant ONLY
  // Admin
  | "team.manage"
  | "billing.manage"
  | "integrations.manage"
  | "settings.manage"
  | "analytics.view";

export const ALL_CAPABILITIES: Capability[] = [
  "jobs.create",
  "jobs.publish",
  "jobs.edit",
  "jobs.delete",
  "apps.view",
  "apps.move_stage",
  "apps.scorecard",
  "apps.message",
  "apps.reject",
  "offers.draft",
  "offers.send_direct",
  "offers.approve",
  "comp.view",
  "candidates.export",
  "eeo.view",
  "team.manage",
  "billing.manage",
  "integrations.manage",
  "settings.manage",
  "analytics.view",
];

/** UI grouping + human labels for the editor. */
export interface CapabilityMeta {
  key: Capability;
  label: string;
  group: "Jobs" | "Pipeline" | "Offers" | "Sensitive" | "Admin";
  help?: string;
}

export const CAPABILITY_META: CapabilityMeta[] = [
  { key: "jobs.create", label: "Create & draft jobs", group: "Jobs" },
  { key: "jobs.publish", label: "Publish / pause jobs", group: "Jobs", help: "Publishing consumes an active-opening slot on your plan." },
  { key: "jobs.edit", label: "Edit jobs", group: "Jobs" },
  { key: "jobs.delete", label: "Delete / archive jobs", group: "Jobs" },
  { key: "apps.view", label: "View applications", group: "Pipeline" },
  { key: "apps.move_stage", label: "Move candidates between stages", group: "Pipeline" },
  { key: "apps.scorecard", label: "Leave scorecards / feedback", group: "Pipeline" },
  { key: "apps.message", label: "Message candidates", group: "Pipeline" },
  { key: "apps.reject", label: "Reject candidates", group: "Pipeline" },
  { key: "offers.draft", label: "Draft offers", group: "Offers" },
  { key: "offers.send_direct", label: "Send offers without approval", group: "Offers" },
  { key: "offers.approve", label: "Approve others' offers", group: "Offers" },
  { key: "comp.view", label: "View compensation / salary fields", group: "Sensitive" },
  { key: "candidates.export", label: "Export candidate data (CSV / PII)", group: "Sensitive" },
  { key: "eeo.view", label: "View EEO / demographic reports", group: "Sensitive", help: "Aggregate only. Owner/admin with explicit grant — never decision-makers." },
  { key: "team.manage", label: "Manage team & invites", group: "Admin" },
  { key: "billing.manage", label: "Manage billing & plan", group: "Admin" },
  { key: "integrations.manage", label: "Manage integrations & automations", group: "Admin" },
  { key: "settings.manage", label: "Manage practice settings", group: "Admin" },
  { key: "analytics.view", label: "View analytics & reports", group: "Admin" },
];

/**
 * Capabilities that may NEVER be granted to a recruiter/hiring_manager via an
 * override — they're owner/admin-tier (billing, team, EEO data). The editor
 * hides them for non-admins and the grant action re-rejects them server-side.
 */
export const ADMIN_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "team.manage",
  "billing.manage",
  "eeo.view",
]);

/** Preset capability set per role. true = on by default for that role. */
export const ROLE_DEFAULTS: Record<DsoRole, Record<Capability, boolean>> = {
  owner: allOf(true),
  admin: { ...allOf(true), "eeo.view": false }, // EEO needs explicit grant even for admin
  recruiter: {
    "jobs.create": true,
    "jobs.publish": true,
    "jobs.edit": true,
    "jobs.delete": false,
    "apps.view": true,
    "apps.move_stage": true,
    "apps.scorecard": true,
    "apps.message": true,
    "apps.reject": true,
    "offers.draft": true,
    "offers.send_direct": false, // grant-only
    "offers.approve": false,
    "comp.view": true, // Cam 2026-06-10: recruiters see comp by default
    "candidates.export": false,
    "eeo.view": false,
    "team.manage": false,
    "billing.manage": false,
    "integrations.manage": false,
    "settings.manage": false,
    "analytics.view": true,
  },
  hiring_manager: {
    "jobs.create": false,
    "jobs.publish": false,
    "jobs.edit": false,
    "jobs.delete": false,
    "apps.view": true, // scoped to assigned locations
    "apps.move_stage": true,
    "apps.scorecard": true,
    "apps.message": false,
    "apps.reject": false,
    "offers.draft": false,
    "offers.send_direct": false,
    "offers.approve": false,
    "comp.view": false, // pay-confidentiality default; admin can grant up
    "candidates.export": false,
    "eeo.view": false,
    "team.manage": false,
    "billing.manage": false,
    "integrations.manage": false,
    "settings.manage": false,
    "analytics.view": false,
  },
};

function allOf(value: boolean): Record<Capability, boolean> {
  return Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, value])) as Record<
    Capability,
    boolean
  >;
}

/** Type guard for a capability string coming from jsonb / a form. */
export function isCapability(v: unknown): v is Capability {
  return typeof v === "string" && (ALL_CAPABILITIES as string[]).includes(v);
}

/**
 * Parse the dso_users.permission_overrides jsonb into a clean partial map.
 * Forgiving: ignores unknown keys + non-boolean values. null/{} → no overrides.
 */
export function parsePermissionOverrides(
  raw: unknown
): Partial<Record<Capability, boolean>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<Capability, boolean>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isCapability(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * The effective capability map for a teammate = role preset merged with their
 * overrides. Unknown role falls back to the most restrictive (hiring_manager).
 * ADMIN_ONLY capabilities can never be turned ON by an override for a
 * non-owner/admin role (compliance floor), even if the jsonb says so.
 */
export function effectivePermissions(
  role: string | null | undefined,
  overridesRaw: unknown
): Record<Capability, boolean> {
  const preset =
    role && role in ROLE_DEFAULTS
      ? ROLE_DEFAULTS[role as DsoRole]
      : ROLE_DEFAULTS.hiring_manager;
  const overrides = parsePermissionOverrides(overridesRaw);
  const isAdminTier = role === "owner" || role === "admin";

  const result = { ...preset };
  for (const cap of ALL_CAPABILITIES) {
    if (cap in overrides) {
      const wanted = overrides[cap] as boolean;
      // Never let an override grant an admin-only capability to a non-admin.
      if (wanted && ADMIN_ONLY_CAPABILITIES.has(cap) && !isAdminTier) continue;
      result[cap] = wanted;
    }
  }
  return result;
}

/** Does this teammate (role + overrides) have `cap`? */
export function can(
  role: string | null | undefined,
  overridesRaw: unknown,
  cap: Capability
): boolean {
  return effectivePermissions(role, overridesRaw)[cap] === true;
}

/**
 * Whether `cap` may be shown as a per-teammate toggle for `targetRole` in the
 * editor. Owner is never edited (has everything); admin-only caps aren't
 * grantable to recruiter/HM.
 */
export function isCapabilityGrantable(
  cap: Capability,
  targetRole: DsoRole
): boolean {
  if (targetRole === "owner") return false;
  if (targetRole === "admin") return true; // admin can be tuned freely except owner-transfer (not a capability)
  return !ADMIN_ONLY_CAPABILITIES.has(cap);
}
