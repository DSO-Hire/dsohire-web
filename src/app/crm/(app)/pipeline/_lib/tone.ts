import type { PipelineOpp } from "./load";

/* Staleness dot: crit when health is stalled, warn when quiet 5+ days.
   Browser-safe: the board and table ship this module. */
export function staleTone(d: Pick<PipelineOpp, "health" | "lastActivityDays">): "good" | "warn" | "crit" {
  if (d.health?.level === "crit") return "crit";
  if (d.lastActivityDays !== null && d.lastActivityDays >= 5) return "warn";
  return "good";
}
