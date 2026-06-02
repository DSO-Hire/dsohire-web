/**
 * N13 Automation Rules Engine — execution core (Phase 1).
 *
 * `runAutomationsForEvent(event)` is the single entry point the dispatch
 * call sites invoke (inside next/after(), same as today's fire-and-forget
 * dispatches). For the event's (dso, trigger) it:
 *   1. loads enabled rules + their actions in sort_order
 *   2. for each rule, CLAIMS a run row (unique (rule_id, application_id,
 *      trigger_event) = loop/dup guard) BEFORE doing work
 *   3. evaluates conditions (AND) against per-event facts
 *   4. runs each action via the existing dispatch primitives
 *   5. records the outcome on the run row (activity feed + audit)
 *
 * NEVER throws — every path swallows + logs, exactly like the dispatch
 * helpers it replaces. A failed automation must never roll back the user
 * action that triggered it.
 *
 * Parity contract (Phase 1): with only the seeded `is_system` default rule
 * enabled, a stage move produces the SAME candidate inbox system message +
 * `candidate.stage_changed` email as the pre-N13 hardcoded path. The two
 * default actions map 1:1 onto the two former dispatch calls; the
 * hideStagesFromCandidate suppression is preserved here.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { dispatchStageChangedEmail } from "@/lib/email/templates/stage-changed-dispatch";
import {
  evaluateConditions,
  type AutomationEvent,
  type RuleActionRow,
  type RuleCondition,
  type RuleFacts,
  type StageChangedEvent,
} from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

interface LoadedRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleActionRow[];
}

interface ActionOutcome {
  action_kind: string;
  status: "ran" | "skipped" | "error";
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────

export async function runAutomationsForEvent(event: AutomationEvent): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const rules = await loadEnabledRules(admin, event.dsoId, event.trigger);
    if (rules.length === 0) return;

    const facts = factsForEvent(event);

    for (const rule of rules) {
      // Claim the run row first — the unique constraint is the dedup guard.
      const claimed = await claimRun(admin, rule.id, event);
      if (!claimed) continue; // already ran for this exact event

      if (!evaluateConditions(rule.conditions, facts)) {
        await finalizeRun(admin, claimed, "skipped_condition", { facts });
        continue;
      }

      const outcomes: ActionOutcome[] = [];
      for (const action of rule.actions) {
        outcomes.push(await runAction(action, event));
      }

      const anyError = outcomes.some((o) => o.status === "error");
      await finalizeRun(admin, claimed, anyError ? "error" : "fired", {
        actions: outcomes,
      });
    }
  } catch (err) {
    console.error("[automations] runAutomationsForEvent failed", err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Rule loading
// ─────────────────────────────────────────────────────────────────────

async function loadEnabledRules(
  admin: ServiceClient,
  dsoId: string,
  trigger: string
): Promise<LoadedRule[]> {
  const { data, error } = await admin
    .from("automation_rules")
    .select(
      "id, name, conditions, sort_order, " +
        "actions:automation_rule_actions(id, action_kind, config, sort_order)"
    )
    .eq("dso_id", dsoId)
    .eq("trigger_kind", trigger)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    if (error) console.warn("[automations] rule load failed", error.message);
    return [];
  }

  return (data as unknown as Array<Record<string, unknown>>).map((r) => {
    const rawConditions = r.conditions;
    const conditions: RuleCondition[] = Array.isArray(rawConditions)
      ? (rawConditions as RuleCondition[])
      : [];
    const rawActions = (r.actions as Array<Record<string, unknown>> | null) ?? [];
    const actions: RuleActionRow[] = rawActions
      .map((a) => ({
        id: a.id as string,
        action_kind: a.action_kind as RuleActionRow["action_kind"],
        config: (a.config as Record<string, unknown> | null) ?? {},
        sort_order: (a.sort_order as number | null) ?? 0,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: r.id as string,
      name: r.name as string,
      conditions,
      actions,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Run ledger
// ─────────────────────────────────────────────────────────────────────

/**
 * Insert a run row, ignoring the duplicate if this (rule, application,
 * trigger_event) already fired. Returns the new row id, or null if it was
 * a duplicate (already processed — skip).
 */
async function claimRun(
  admin: ServiceClient,
  ruleId: string,
  event: AutomationEvent
): Promise<string | null> {
  const { data, error } = await admin
    .from("automation_rule_runs")
    .upsert(
      {
        rule_id: ruleId,
        dso_id: event.dsoId,
        application_id: event.applicationId,
        trigger_event: event.triggerEventKey,
        status: "fired",
        detail: {},
      },
      { onConflict: "rule_id,application_id,trigger_event", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[automations] claimRun failed", error.message);
    return null;
  }
  return ((data as { id: string } | null)?.id as string | null) ?? null;
}

async function finalizeRun(
  admin: ServiceClient,
  runId: string,
  status: "fired" | "skipped_condition" | "error",
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from("automation_rule_runs")
    .update({ status, detail })
    .eq("id", runId);
  if (error) console.warn("[automations] finalizeRun failed", error.message);
}

// ─────────────────────────────────────────────────────────────────────
// Facts
// ─────────────────────────────────────────────────────────────────────

function factsForEvent(event: AutomationEvent): RuleFacts {
  switch (event.trigger) {
    case "application.stage_changed":
      return {
        to_kind: event.toKind,
        from_kind: event.fromKind,
        job_id: event.jobId,
      };
    default:
      return {};
  }
}

// ─────────────────────────────────────────────────────────────────────
// Action runners (Phase 1: the two candidate-facing primitives)
// ─────────────────────────────────────────────────────────────────────

async function runAction(
  action: RuleActionRow,
  event: AutomationEvent
): Promise<ActionOutcome> {
  try {
    switch (action.action_kind) {
      case "inbox_system_message":
        return await runInboxSystemMessage(event);
      case "email_candidate":
        return await runEmailCandidate(event);
      case "add_tag":
        return await runAddTag(action, event);
      // Reserved actions — not yet runnable. `move_stage` is HELD on
      // purpose (Cam, Day 25 — the riskiest foot-gun + the loop case);
      // notify_teammate / assign need notification-eventkind / schema
      // plumbing landing in a later chunk; start_sequence is the N16 hook.
      // No-op safely so a rule carrying one never crashes the engine.
      case "notify_teammate":
      case "assign":
      case "move_stage":
      case "start_sequence":
        return {
          action_kind: action.action_kind,
          status: "skipped",
          note: "not yet implemented in this phase",
        };
      default:
        return { action_kind: action.action_kind, status: "skipped", note: "unknown action" };
    }
  } catch (err) {
    console.error("[automations] action failed", action.action_kind, err);
    return { action_kind: action.action_kind, status: "error", note: String(err) };
  }
}

async function runInboxSystemMessage(event: AutomationEvent): Promise<ActionOutcome> {
  if (event.trigger !== "application.stage_changed") {
    return { action_kind: "inbox_system_message", status: "skipped", note: "trigger n/a" };
  }
  const e = event as StageChangedEvent;
  // Candidate-facing → suppressed when the job hides stages from candidates.
  if (e.hideStagesFromCandidate) {
    return { action_kind: "inbox_system_message", status: "skipped", note: "stages hidden" };
  }
  await dispatchInboxSystemMessage({
    applicationId: e.applicationId,
    eventKind: "stage_changed",
    senderRole: "employer",
    body: `Your application moved from ${e.fromStageLabel} to ${e.toStageLabel}.`,
  });
  return { action_kind: "inbox_system_message", status: "ran" };
}

async function runEmailCandidate(event: AutomationEvent): Promise<ActionOutcome> {
  if (event.trigger !== "application.stage_changed") {
    return { action_kind: "email_candidate", status: "skipped", note: "trigger n/a" };
  }
  const e = event as StageChangedEvent;
  if (e.hideStagesFromCandidate) {
    return { action_kind: "email_candidate", status: "skipped", note: "stages hidden" };
  }
  // Parity: today's email only fires when the candidate id is known (guest
  // applications have no auth record and get no stage emails).
  if (!e.candidateId) {
    return { action_kind: "email_candidate", status: "skipped", note: "no candidate id" };
  }
  await dispatchStageChangedEmail({
    applicationId: e.applicationId,
    candidateId: e.candidateId,
    jobId: e.jobId,
    jobTitle: e.jobTitle,
    dsoId: e.dsoId,
    fromStageLabel: e.fromStageLabel,
    toStageLabel: e.toStageLabel,
  });
  return { action_kind: "email_candidate", status: "ran" };
}

/**
 * Add an internal tag to the application. Tags are an internal workspace
 * concept (not candidate-facing), so this is NOT gated on
 * hideStagesFromCandidate. Reuses the application_tags table the manual
 * tag UI writes to; the (application_id, label) unique constraint makes a
 * repeat no-op (23505 swallowed).
 */
async function runAddTag(
  action: RuleActionRow,
  event: AutomationEvent
): Promise<ActionOutcome> {
  const label = String((action.config.label as string | undefined) ?? "").trim();
  if (!label) {
    return { action_kind: "add_tag", status: "skipped", note: "no tag label" };
  }
  const color = String((action.config.color as string | undefined) ?? "slate");
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("application_tags").insert({
    application_id: event.applicationId,
    label: label.slice(0, 40),
    color,
    created_by: null,
  });
  if (error && error.code !== "23505") {
    return { action_kind: "add_tag", status: "error", note: error.message };
  }
  return { action_kind: "add_tag", status: "ran" };
}
