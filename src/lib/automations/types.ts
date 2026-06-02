/**
 * N13 Automation Rules Engine — shared types.
 *
 * Model: a rule is one TRIGGER + flat AND-joined CONDITIONS + ordered
 * ACTIONS. The engine (./engine.ts) loads enabled rules for a (dso,
 * trigger), evaluates conditions against a per-event facts record, and
 * runs each action, recording one automation_rule_runs row per (rule,
 * application, trigger_event) for idempotency + an activity feed.
 *
 * Phase 1 (foundation + parity) wires only the `application.stage_changed`
 * trigger and the two candidate-facing actions that reproduce today's
 * hardcoded dispatch. The remaining triggers/actions are declared here +
 * reserved in the DB CHECK constraints so later phases need no schema
 * change. See Business Plan & Strategy/N13_Automation_Rules_Engine_Design_2026-06-02.md.
 */

import type { StageKind } from "@/lib/applications/stages";

// ─────────────────────────────────────────────────────────────────────
// Triggers
// ─────────────────────────────────────────────────────────────────────

export const AUTOMATION_TRIGGERS = [
  "application.received",
  "application.stage_changed",
  "application.message_received",
  "application.withdrawn",
  "interview.booked",
  "interview.cancelled",
  "offer.sent",
  "offer.accepted",
  "offer.declined",
  "application.idle_in_stage",
  "application.no_response",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/** Triggers actually wired in Phase 1. Others are reserved for later phases. */
export const PHASE1_TRIGGERS: AutomationTrigger[] = ["application.stage_changed"];

// ─────────────────────────────────────────────────────────────────────
// Conditions — flat AND-joined array. `[]` means always-true.
// ─────────────────────────────────────────────────────────────────────

export type ConditionOp = "in" | "eq" | "neq" | "gte" | "lte";

export interface RuleCondition {
  /** Fact key — e.g. "to_kind", "from_kind", "job_id". */
  field: string;
  op: ConditionOp;
  /** Scalar for eq/neq/gte/lte; array for `in`. */
  value: string | number | string[] | number[];
}

/**
 * Facts a rule's conditions are evaluated against. Built per-event by the
 * caller from context already in hand (no extra DB round-trips in the hot
 * path). Phase 1 supplies stage facts; later phases enrich (role_category,
 * fit_score, source, days_in_stage).
 */
export type RuleFacts = Record<string, string | number | undefined>;

// ─────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────

export const AUTOMATION_ACTION_KINDS = [
  "email_candidate",
  "email_candidate_nurture", // N16 — custom re-engagement message to the candidate
  "inbox_system_message",
  "notify_teammate",
  "assign",
  "add_tag",
  "move_stage", // HELD (Cam, Day 25) — reserved, not runnable yet
  "start_sequence", // N16 hook — reserved
] as const;
export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];

/** Actions the engine can actually execute in Phase 1. */
export const PHASE1_ACTION_KINDS: AutomationActionKind[] = [
  "email_candidate",
  "inbox_system_message",
];

export interface RuleActionRow {
  id: string;
  action_kind: AutomationActionKind;
  config: Record<string, unknown>;
  sort_order: number;
}

export interface RuleRow {
  id: string;
  dso_id: string;
  name: string;
  trigger_kind: AutomationTrigger;
  conditions: RuleCondition[];
  is_enabled: boolean;
  is_system: boolean;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────
// Per-trigger event context passed into the engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Context for an `application.stage_changed` event. Carries everything the
 * Phase 1 actions need so the engine performs NO extra DB reads on the hot
 * path beyond loading the rules themselves. Mirrors exactly what the two
 * call sites (single-move actions.ts + bulk moveOne) already compute.
 */
export interface StageChangedEvent {
  trigger: "application.stage_changed";
  applicationId: string;
  dsoId: string;
  candidateId: string | null;
  jobId: string;
  jobTitle: string;
  fromStageLabel: string;
  toStageLabel: string;
  fromKind: StageKind;
  toKind: StageKind;
  /** When true, candidate-facing actions are suppressed (job setting). */
  hideStagesFromCandidate: boolean;
  /**
   * Unique-per-event key for the idempotency ledger. For a stage move this
   * is distinct per move (so each real move fires); for time triggers it is
   * a deterministic window bucket (so cron re-runs dedup).
   */
  triggerEventKey: string;
}

/**
 * Context for an `application.received` event — a new application landed.
 * Fired ADDITIVELY from the apply flow (after the existing acknowledgment
 * email), so candidate-facing email/inbox actions are intentionally NOT run
 * for this trigger (the ack already covers them); the useful actions here
 * are notify_teammate + add_tag.
 */
export interface ReceivedEvent {
  trigger: "application.received";
  applicationId: string;
  dsoId: string;
  candidateId: string | null;
  jobId: string;
  jobTitle: string;
  triggerEventKey: string;
}

/**
 * Context for an `application.idle_in_stage` event — fired by the
 * /api/cron/automation-rules cron for an application that has sat in its
 * current (non-terminal) stage past a rule's day threshold. The cron passes
 * `daysInStage` as a fact so a rule's `days_in_stage >= N` condition decides
 * which threshold actually fires. Time-based, so only INTERNAL actions
 * (notify_teammate / add_tag / assign) run — candidate-facing nurture mail
 * is N16's job.
 */
export interface IdleInStageEvent {
  trigger: "application.idle_in_stage";
  applicationId: string;
  dsoId: string;
  candidateId: string | null;
  jobId: string;
  jobTitle: string;
  /** Kind of the stage the application is sitting in. */
  toKind: StageKind;
  stageId: string;
  stageLabel: string;
  daysInStage: number;
  triggerEventKey: string;
}

/** Wired-trigger union (widens as more triggers are added). */
export type AutomationEvent = StageChangedEvent | ReceivedEvent | IdleInStageEvent;

// ─────────────────────────────────────────────────────────────────────
// Condition evaluation — pure, shared by the engine + the UI dry-run
// ─────────────────────────────────────────────────────────────────────

/**
 * Evaluate one condition against the facts. Fails CLOSED: if the fact is
 * absent (undefined), the condition does not pass — so a custom rule whose
 * condition references a fact we couldn't resolve never fires by surprise.
 */
export function evaluateCondition(cond: RuleCondition, facts: RuleFacts): boolean {
  const fact = facts[cond.field];
  if (fact === undefined) return false;

  switch (cond.op) {
    case "in": {
      const arr = Array.isArray(cond.value) ? (cond.value as Array<string | number>) : [];
      return arr.some((v) => v === fact);
    }
    case "eq":
      return fact === cond.value;
    case "neq":
      return fact !== cond.value;
    case "gte":
      return typeof fact === "number" && typeof cond.value === "number" && fact >= cond.value;
    case "lte":
      return typeof fact === "number" && typeof cond.value === "number" && fact <= cond.value;
    default:
      return false;
  }
}

/** All conditions must pass (AND). Empty array = always-true. */
export function evaluateConditions(conditions: RuleCondition[], facts: RuleFacts): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, facts));
}
