/* Opportunity-area labels and small pure helpers. Browser-safe, and kept
   out of the "use server" action files (which may export async functions
   only). Shared vocabulary (stages, plans, lost reasons) lives in
   ../../format.ts; this file only adds what the opportunity surfaces need. */
import { effectiveStages } from "../../format";

export const BALLS = ["us", "prospect", "partner"] as const;
export const PRIORITIES = ["high", "normal", "low"] as const;
export const REPEATS = ["none", "weekly", "monthly"] as const;

export const PRIORITY_LABELS: Record<string, string> = { high: "HIGH", normal: "NORMAL", low: "LOW" };

export const BALL_OPTION_LABELS: Record<string, string> = {
  us: "Us",
  prospect: "Prospect",
  partner: "Partner",
};

export const BILLING_LABELS: Record<string, string> = { monthly: "Monthly", annual: "Annual" };

/* Activities a person can log from the record (crm_events kinds). */
export const ACTIVITY_KINDS: { key: string; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "email", label: "Email" },
  { key: "call", label: "Call" },
  { key: "meeting", label: "Meeting" },
  { key: "linkedin", label: "LinkedIn" },
];

/* Pipeline stage groups (the filter bar's STAGE chips). */
export type StageGroup = "early" | "active" | "late" | "won";
const GROUP_OF: Record<string, StageGroup> = {
  target: "early",
  contacted: "early",
  engaged: "early",
  discovery: "active",
  demo: "active",
  proposal: "late",
  negotiation: "late",
  won: "won",
};

export function stageGroup(stage: string, custom: string[] | null | undefined): StageGroup {
  if (stage === "won") return "won";
  const g = GROUP_OF[stage];
  if (g && !(custom && custom.length)) return g;
  const list = effectiveStages(custom).filter((s) => s !== "won");
  const idx = list.indexOf(stage);
  if (idx < 0) return g ?? "early";
  const f = list.length > 1 ? idx / (list.length - 1) : 0;
  return f < 0.34 ? "early" : f < 0.67 ? "active" : "late";
}

export function initials(p: { email?: string | null; full_name?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const n = (p.full_name ?? "").trim();
  if (n) return n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return p.email ? p.email.slice(0, 2).toUpperCase() : null;
}

export function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
