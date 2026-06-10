/**
 * N12 Phase 2 — offer approval policy + the send-gate decision.
 *
 * Pure + deterministic so the SAME function decides the gate on the
 * client (button label: "Send" vs "Submit for approval") and on the
 * server (the authoritative routing). The client copy is a convenience;
 * the server re-runs this and is the source of truth.
 *
 * The locked permission model (Cam, Day 25):
 *   • Owner + admin send directly. Recruiters + hiring managers need
 *     owner/admin approval for every offer, UNLESS an admin granted them
 *     `can_send_offers_directly`.
 *   • "Out-of-range offers always need approval" — a DSO toggle (default
 *     ON). When ON, even an empowered sender is routed to approval if the
 *     base falls outside the job's posted range. When OFF, an empowered
 *     sender gets a warn-only banner and can send anyway.
 *   • Optional $ ceiling — an annualized base above which approval is
 *     required even for empowered senders.
 *
 * Tier gate (Fork E): approval chains are Scale+. Below Scale the whole
 * mechanism is OFF — everyone who could send before still sends directly,
 * exactly the pre-N12 behavior (we never strand a recruiter with no one
 * able to approve).
 *
 * PURE module — no server-only imports — so the offer compose modal (a
 * client component) can import resolveOfferGate to label its button. The
 * tier check (dsoCanUseOfferApprovals) lives in ./approval-tier (server).
 */

import type { GuardrailSeverity } from "@/lib/offers/comp-guardrail";

const HOURS_PER_YEAR = 2080; // 40h × 52w — same basis as comp-guardrail/benchmarks.

/** Tiers that unlock the offer-approval mechanism. */
export const OFFER_APPROVAL_TIERS = new Set(["scale", "enterprise"]);

export interface OfferApprovalPolicy {
  /** Out-of-range offers always route to approval (default ON). */
  require_when_out_of_range: boolean;
  /**
   * Annualized base above which approval is required even for empowered
   * senders. null = no ceiling.
   */
  require_above_amount: number | null;
}

export const DEFAULT_OFFER_APPROVAL_POLICY: OfferApprovalPolicy = {
  require_when_out_of_range: true,
  require_above_amount: null,
};

/** Coerce the raw jsonb column into a well-formed policy (forgiving). */
export function parseOfferApprovalPolicy(raw: unknown): OfferApprovalPolicy {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OFFER_APPROVAL_POLICY };
  const o = raw as Record<string, unknown>;
  const reqOOR =
    typeof o.require_when_out_of_range === "boolean"
      ? o.require_when_out_of_range
      : DEFAULT_OFFER_APPROVAL_POLICY.require_when_out_of_range;
  let ceiling: number | null = null;
  if (typeof o.require_above_amount === "number" && Number.isFinite(o.require_above_amount) && o.require_above_amount > 0) {
    ceiling = o.require_above_amount;
  }
  return { require_when_out_of_range: reqOOR, require_above_amount: ceiling };
}

export type OfferRole = "owner" | "admin" | "recruiter" | "hiring_manager" | string;

/**
 * An empowered sender can send offers without per-offer approval.
 *
 * #83 Phase 2: `canSendDirectly` is now the capability-resolved
 * can(role, permission_overrides, "offers.send_direct") — role defaults are
 * already encoded there (owner/admin true, recruiter/HM grant-only), so this
 * no longer short-circuits on role. That also means a per-teammate override
 * can restrict an ADMIN's direct send (it couldn't before). The legacy
 * dso_users.can_send_offers_directly column is dead — never pass it here.
 * `role` is kept for call-site readability/back-compat only.
 */
export function isEmpoweredSender(role: OfferRole, canSendDirectly: boolean): boolean {
  void role;
  return canSendDirectly === true;
}

export type OfferGateReason = "sender_not_empowered" | "out_of_range" | "above_ceiling";

export type OfferGate =
  | { mode: "send" }
  | { mode: "approval"; reason: OfferGateReason };

export interface ResolveOfferGateInput {
  /** Tier gate — false below Scale (mechanism off → always "send"). */
  approvalsEnabled: boolean;
  role: OfferRole;
  canSendDirectly: boolean;
  /** Server-evaluated guardrail severity vs the job's posted range. */
  guardrailSeverity: GuardrailSeverity;
  /** Structured base (as entered) + its period, for the ceiling check. */
  baseAmount: number | null;
  basePeriod: "hourly" | "annual";
  policy: OfferApprovalPolicy;
}

/** Normalize a base amount to an annual figure for the ceiling comparison. */
function annualize(amount: number, period: "hourly" | "annual"): number {
  return period === "annual" ? amount : amount * HOURS_PER_YEAR;
}

/**
 * The single gate decision. Order matters: a non-empowered sender always
 * routes to approval (reason wins regardless of range); then the ceiling;
 * then the out-of-range policy.
 */
export function resolveOfferGate(input: ResolveOfferGateInput): OfferGate {
  // Mechanism off (below Scale) → preserve pre-N12 direct-send behavior.
  if (!input.approvalsEnabled) return { mode: "send" };

  if (!isEmpoweredSender(input.role, input.canSendDirectly)) {
    return { mode: "approval", reason: "sender_not_empowered" };
  }

  // Empowered sender — only specific conditions route to approval.
  const { policy, baseAmount, basePeriod, guardrailSeverity } = input;
  if (
    policy.require_above_amount != null &&
    baseAmount != null &&
    Number.isFinite(baseAmount) &&
    baseAmount > 0 &&
    annualize(baseAmount, basePeriod) > policy.require_above_amount
  ) {
    return { mode: "approval", reason: "above_ceiling" };
  }

  if (guardrailSeverity === "out_of_range" && policy.require_when_out_of_range) {
    return { mode: "approval", reason: "out_of_range" };
  }

  return { mode: "send" };
}

/** Human-readable reason → one-liner, used in audit + the approval queue. */
export function offerGateReasonLabel(reason: OfferGateReason): string {
  switch (reason) {
    case "sender_not_empowered":
      return "Sender isn't permitted to send offers directly";
    case "out_of_range":
      return "Base is outside the job's posted pay range";
    case "above_ceiling":
      return "Base is above the approval ceiling";
    default:
      return "Approval required";
  }
}
