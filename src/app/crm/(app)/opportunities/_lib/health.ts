/* Opportunity health: a short list of reasons an opportunity needs a nudge,
   each linked to the part of the record that fixes it. Ported from the EDC
   deal health; the M&A checks (IOI/LOI dates, buyer coverage, offers) become
   SaaS sales checks (days in stage, gone quiet, next step, target close).
   Pure function, no I/O, browser-safe. */
import { daysAgo, daysUntil } from "./dates";

export type HealthTone = "warn" | "crit";
export type HealthReason = { tone: HealthTone; text: string; anchor: string };
export type Health = {
  level: "good" | "warn" | "crit";
  label: "ON TRACK" | "WATCH" | "STALLED";
  reasons: HealthReason[];
};

/** Days an opportunity can sit in a stage before it is worth a look. */
export const STAGE_LIMIT_DAYS: Record<string, number> = {
  target: 30,
  contacted: 14,
  engaged: 14,
  discovery: 14,
  demo: 14,
  proposal: 21,
  negotiation: 21,
};

export type HealthInput = {
  opp: {
    stage: string;
    stage_changed_at?: string | null;
    created_at?: string | null;
    next_step?: string | null;
    next_step_due?: string | null;
    target_close?: string | null;
  };
  openTasks: { ball: string; due_date?: string | null; waiting_since?: string | null; priority?: string | null }[];
  lastActivityAt: string | null;
  nowMs?: number;
};

export function oppHealth({ opp, openTasks, lastActivityAt, nowMs }: HealthInput): Health {
  const reasons: HealthReason[] = [];
  if (opp.stage === "lost" || opp.stage === "won") return { level: "good", label: "ON TRACK", reasons };

  const inStage = daysAgo(opp.stage_changed_at ?? opp.created_at, nowMs) ?? 0;
  const limit = STAGE_LIMIT_DAYS[opp.stage] ?? 21;
  if (inStage > limit * 2) {
    reasons.push({ tone: "crit", text: `${inStage}d in stage, more than twice the ${limit}d norm`, anchor: "#dx-flow" });
  } else if (inStage > limit) {
    reasons.push({ tone: "warn", text: `${inStage}d in stage, past the ${limit}d norm`, anchor: "#dx-flow" });
  }

  /* A target has not been contacted yet, so silence there is expected. */
  if (opp.stage !== "target") {
    const quiet = daysAgo(lastActivityAt, nowMs);
    if (quiet !== null && quiet >= 14) {
      reasons.push({ tone: "crit", text: `No touch in ${quiet}d`, anchor: "#dx-timeline" });
    } else if (quiet !== null && quiet >= 7) {
      reasons.push({ tone: "warn", text: `Quiet for ${quiet}d`, anchor: "#dx-timeline" });
    }
  }

  const overdue = openTasks.filter((t) => {
    const d = daysUntil(t.due_date);
    return d !== null && d < 0;
  });
  if (overdue.length >= 3 || overdue.some((t) => t.priority === "high")) {
    reasons.push({ tone: "crit", text: `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`, anchor: "#dx-tasks" });
  } else if (overdue.length > 0) {
    reasons.push({ tone: "warn", text: `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`, anchor: "#dx-tasks" });
  }

  const waiting = openTasks
    .filter((t) => t.ball !== "us" && t.waiting_since)
    .map((t) => ({ ball: t.ball, days: daysAgo(t.waiting_since, nowMs) ?? 0 }))
    .sort((a, b) => b.days - a.days)[0];
  if (waiting && waiting.days >= 5) {
    reasons.push({ tone: "warn", text: `${waiting.ball.toUpperCase()} court ${waiting.days}d`, anchor: "#dx-tasks" });
  }

  if (!(opp.next_step ?? "").trim()) {
    reasons.push({ tone: "warn", text: "No next step set", anchor: "#dx-next" });
  } else {
    const due = daysUntil(opp.next_step_due);
    if (due !== null && due < -7) {
      reasons.push({ tone: "crit", text: `Next step ${-due}d overdue`, anchor: "#dx-next" });
    } else if (due !== null && due < 0) {
      reasons.push({ tone: "warn", text: `Next step ${-due}d overdue`, anchor: "#dx-next" });
    }
  }

  const tc = daysUntil(opp.target_close);
  if (tc !== null && tc < 0) {
    reasons.push({ tone: "crit", text: `Target close missed by ${-tc}d`, anchor: "#dx-dates" });
  }

  const level = reasons.some((r) => r.tone === "crit") ? "crit" : reasons.length ? "warn" : "good";
  return {
    level,
    label: level === "crit" ? "STALLED" : level === "warn" ? "WATCH" : "ON TRACK",
    reasons: reasons.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "crit" ? -1 : 1)),
  };
}
