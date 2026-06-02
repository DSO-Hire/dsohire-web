"use server";

/**
 * N13 automation rules — server actions for the /employer/automations
 * builder. Every mutation is gated owner/admin (RLS enforces this too) and,
 * for CUSTOM rules, Scale+ (dsoCanUseAutomationRules). Enable/disable is
 * allowed on any tier so a DSO can always turn the seeded default off.
 *
 * The seeded `is_system` default rule is editable (conditions/actions/name)
 * by Scale+ but NOT deletable — deletion is refused here.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { dsoCanUseAutomationRules } from "./tier";
import {
  evaluateConditions,
  type RuleCondition,
  type AutomationActionKind,
  type AutomationTrigger,
} from "./types";
import { STAGE_KINDS, type StageKind } from "@/lib/applications/stages";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// Triggers the builder may target in this phase.
const UI_TRIGGERS = new Set<AutomationTrigger>([
  "application.stage_changed",
  "application.received",
]);
// Actions allowed per trigger. received is ADDITIVE (fires after the existing
// ack email), so candidate-facing email/inbox actions aren't offered there —
// only the internal actions (tag, notify a teammate).
const ACTIONS_BY_TRIGGER: Record<string, Set<AutomationActionKind>> = {
  "application.stage_changed": new Set<AutomationActionKind>([
    "email_candidate",
    "inbox_system_message",
    "add_tag",
    "notify_teammate",
    "assign",
  ]),
  "application.received": new Set<AutomationActionKind>([
    "add_tag",
    "notify_teammate",
    "assign",
  ]),
};
/** Action kinds whose config carries a dso_user target that must be validated. */
const TEAMMATE_TARGET_ACTIONS = new Set<AutomationActionKind>([
  "notify_teammate",
  "assign",
]);
// Condition fields available per trigger.
const CONDITION_FIELDS_BY_TRIGGER: Record<string, Set<string>> = {
  "application.stage_changed": new Set(["to_kind", "from_kind", "job_id"]),
  "application.received": new Set(["job_id"]),
};
const CONDITION_OPS = new Set(["in", "eq", "neq", "gte", "lte"]);
const VALID_KINDS = new Set<StageKind>(STAGE_KINDS);

interface ActionInput {
  action_kind: AutomationActionKind;
  config: Record<string, unknown>;
}

interface RuleInput {
  name: string;
  trigger_kind: AutomationTrigger;
  conditions: RuleCondition[];
  actions: ActionInput[];
}

async function resolveOwnerAdmin(): Promise<
  | { ok: true; dsoId: string; dsoUserId: string }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const { data: me } = await supabase
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: "Teammate record not found." };
  const role = me.role as string;
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage automations." };
  }
  return { ok: true, dsoId: me.dso_id as string, dsoUserId: me.id as string };
}

function validateRuleInput(input: RuleInput): string | null {
  const name = (input.name ?? "").trim();
  if (name.length < 1) return "Give the rule a name.";
  if (name.length > 80) return "Rule name is too long (80 char max).";
  if (!UI_TRIGGERS.has(input.trigger_kind)) return "Unsupported trigger.";

  const allowedActions = ACTIONS_BY_TRIGGER[input.trigger_kind];
  const allowedFields = CONDITION_FIELDS_BY_TRIGGER[input.trigger_kind];
  if (!allowedActions || !allowedFields) return "Unsupported trigger.";

  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    return "Add at least one action.";
  }
  for (const a of input.actions) {
    if (!allowedActions.has(a.action_kind)) {
      return "That action isn't available for this trigger.";
    }
    if (a.action_kind === "add_tag") {
      const label = String((a.config?.label as string | undefined) ?? "").trim();
      if (!label) return "Tag action needs a label.";
    }
    if (TEAMMATE_TARGET_ACTIONS.has(a.action_kind)) {
      const target = String(
        (a.config?.target_dso_user_id as string | undefined) ?? ""
      ).trim();
      if (!target) {
        return a.action_kind === "assign"
          ? "Choose a teammate to assign to."
          : "Choose a teammate to notify.";
      }
    }
  }
  for (const c of input.conditions ?? []) {
    if (!allowedFields.has(c.field)) return `Unknown condition field: ${c.field}.`;
    if (!CONDITION_OPS.has(c.op)) return `Unknown operator: ${c.op}.`;
    if (c.field === "to_kind" || c.field === "from_kind") {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of vals) {
        if (!VALID_KINDS.has(v as StageKind)) return `Unknown stage kind: ${String(v)}.`;
      }
    }
  }
  return null;
}

/**
 * Confirm every notify_teammate action targets a teammate in THIS DSO.
 * Returns an error string, or null if clean. Async (needs a DB check), so
 * it runs in create/update after the sync validation.
 */
async function validateTeammateTargets(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  actions: ActionInput[]
): Promise<string | null> {
  const targets = actions
    .filter((a) => TEAMMATE_TARGET_ACTIONS.has(a.action_kind))
    .map((a) => String((a.config?.target_dso_user_id as string | undefined) ?? "").trim())
    .filter(Boolean);
  if (targets.length === 0) return null;

  const { data } = await supabase
    .from("dso_users")
    .select("id")
    .eq("dso_id", dsoId)
    .in("id", targets);
  const found = new Set(((data as Array<{ id: string }> | null) ?? []).map((r) => r.id));
  for (const t of targets) {
    if (!found.has(t)) return "One of the chosen teammates isn't on your team.";
  }
  return null;
}

export async function setRuleEnabled(
  ruleId: string,
  enabled: boolean
): Promise<ActionResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("automation_rules")
    .update({ is_enabled: enabled })
    .eq("id", ruleId)
    .eq("dso_id", who.dsoId);
  if (error) return { ok: false, error: "Couldn't update the rule." };
  revalidatePath("/employer/automations");
  return { ok: true };
}

export async function createAutomationRule(input: RuleInput): Promise<ActionResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseAutomationRules(supabase, who.dsoId))) {
    return { ok: false, error: "Custom automations are a Scale feature." };
  }
  const invalid = validateRuleInput(input);
  if (invalid) return { ok: false, error: invalid };
  const teammateErr = await validateTeammateTargets(supabase, who.dsoId, input.actions);
  if (teammateErr) return { ok: false, error: teammateErr };

  const { data: rule, error } = await supabase
    .from("automation_rules")
    .insert({
      dso_id: who.dsoId,
      name: input.name.trim(),
      trigger_kind: input.trigger_kind,
      conditions: input.conditions ?? [],
      is_enabled: false, // ships disabled — explicit enable required
      is_system: false,
      created_by: who.dsoUserId,
    })
    .select("id")
    .single();
  if (error || !rule) return { ok: false, error: "Couldn't create the rule." };

  const ruleId = rule.id as string;
  const rows = input.actions.map((a, i) => ({
    rule_id: ruleId,
    action_kind: a.action_kind,
    config: a.config ?? {},
    sort_order: i,
  }));
  const { error: aerr } = await supabase.from("automation_rule_actions").insert(rows);
  if (aerr) {
    // Roll back the orphaned rule so we don't leave an action-less rule.
    await supabase.from("automation_rules").delete().eq("id", ruleId);
    return { ok: false, error: "Couldn't save the rule's actions." };
  }
  revalidatePath("/employer/automations");
  return { ok: true, id: ruleId };
}

export async function updateAutomationRule(
  ruleId: string,
  input: RuleInput
): Promise<ActionResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseAutomationRules(supabase, who.dsoId))) {
    return { ok: false, error: "Custom automations are a Scale feature." };
  }
  const invalid = validateRuleInput(input);
  if (invalid) return { ok: false, error: invalid };
  const teammateErr = await validateTeammateTargets(supabase, who.dsoId, input.actions);
  if (teammateErr) return { ok: false, error: teammateErr };

  // Confirm ownership + trigger immutability (don't let an edit change the
  // trigger of the system default out from under the seeder).
  const { data: existing } = await supabase
    .from("automation_rules")
    .select("id, dso_id, trigger_kind, is_system")
    .eq("id", ruleId)
    .eq("dso_id", who.dsoId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Rule not found." };
  if ((existing.trigger_kind as string) !== input.trigger_kind) {
    return { ok: false, error: "A rule's trigger can't be changed after creation." };
  }

  const { error } = await supabase
    .from("automation_rules")
    .update({ name: input.name.trim(), conditions: input.conditions ?? [] })
    .eq("id", ruleId)
    .eq("dso_id", who.dsoId);
  if (error) return { ok: false, error: "Couldn't update the rule." };

  // Replace the action set (delete + reinsert in order).
  await supabase.from("automation_rule_actions").delete().eq("rule_id", ruleId);
  const rows = input.actions.map((a, i) => ({
    rule_id: ruleId,
    action_kind: a.action_kind,
    config: a.config ?? {},
    sort_order: i,
  }));
  const { error: aerr } = await supabase.from("automation_rule_actions").insert(rows);
  if (aerr) return { ok: false, error: "Couldn't save the rule's actions." };

  revalidatePath("/employer/automations");
  return { ok: true, id: ruleId };
}

export async function deleteAutomationRule(ruleId: string): Promise<ActionResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseAutomationRules(supabase, who.dsoId))) {
    return { ok: false, error: "Custom automations are a Scale feature." };
  }
  const { data: existing } = await supabase
    .from("automation_rules")
    .select("id, is_system")
    .eq("id", ruleId)
    .eq("dso_id", who.dsoId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Rule not found." };
  if (existing.is_system as boolean) {
    return { ok: false, error: "The default rule can't be deleted — disable it instead." };
  }
  const { error } = await supabase
    .from("automation_rules")
    .delete()
    .eq("id", ruleId)
    .eq("dso_id", who.dsoId);
  if (error) return { ok: false, error: "Couldn't delete the rule." };
  revalidatePath("/employer/automations");
  return { ok: true };
}

export type DryRunResult =
  | { ok: true; sampled: number; matched: number }
  | { ok: false; error: string };

/**
 * Preview a rule's conditions against the DSO's recent employer-driven
 * stage moves. Read-only; owner/admin (the builder UI that calls it is
 * already Scale-gated). Reuses the engine's pure condition evaluator so
 * the preview matches real firing exactly.
 */
export async function dryRunStageChangedRule(
  conditions: RuleCondition[]
): Promise<DryRunResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;

  // Service-role read scoped explicitly to this DSO (the user is already
  // verified as an owner/admin of who.dsoId above). Done in simple steps
  // with plain filters to avoid fragile nested embedded-filter behavior:
  //   1. the DSO's job ids
  //   2. the applications on those jobs (id -> job_id map)
  //   3. the most recent employer-driven stage events on those apps
  const admin = createSupabaseServiceRoleClient();

  const { data: jobRows, error: jobErr } = await admin
    .from("jobs")
    .select("id")
    .eq("dso_id", who.dsoId);
  if (jobErr) return { ok: false, error: "Couldn't run the preview." };
  const jobIds = ((jobRows as Array<{ id: string }> | null) ?? []).map((j) => j.id);
  if (jobIds.length === 0) return { ok: true, sampled: 0, matched: 0 };

  const { data: appRows, error: appErr } = await admin
    .from("applications")
    .select("id, job_id")
    .in("job_id", jobIds)
    .limit(5000);
  if (appErr) return { ok: false, error: "Couldn't run the preview." };
  const appToJob = new Map<string, string>();
  for (const a of (appRows as Array<{ id: string; job_id: string }> | null) ?? []) {
    appToJob.set(a.id, a.job_id);
  }
  if (appToJob.size === 0) return { ok: true, sampled: 0, matched: 0 };

  const { data: events, error: evErr } = await admin
    .from("application_status_events")
    .select("from_stage_kind, to_stage_kind, application_id")
    .in("application_id", Array.from(appToJob.keys()))
    .eq("actor_type", "employer")
    .order("created_at", { ascending: false })
    .limit(50);
  if (evErr) return { ok: false, error: "Couldn't run the preview." };

  const rows = (events as Array<Record<string, unknown>> | null) ?? [];
  let matched = 0;
  for (const r of rows) {
    const facts = {
      to_kind: (r.to_stage_kind as string | null) ?? undefined,
      from_kind: (r.from_stage_kind as string | null) ?? undefined,
      job_id: appToJob.get(r.application_id as string) ?? undefined,
    };
    if (evaluateConditions(conditions ?? [], facts)) matched++;
  }
  return { ok: true, sampled: rows.length, matched };
}
