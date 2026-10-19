/* Date helpers for the opportunity record and the pipeline, ported from the
   EDC deals area. The workspace runs on Central time, so "today" and every
   countdown are computed against America/Chicago (todayIso in format.ts).
   Browser-safe: no I/O. */
import { todayIso } from "../../format";

const DAY = 86_400_000;

/** A YYYY-MM-DD string shifted by n days. */
export function addDays(dateIso: string, n: number): string {
  const t = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`) + n * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from today (Central) to dateIso. Negative when in the past. */
export function daysUntil(dateIso: string | null | undefined, today: string = todayIso()): number | null {
  if (!dateIso) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY);
}

/** Whole days since an ISO timestamp (or date). Null when unknown. */
export function daysAgo(iso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY));
}

export function fmtShort(dateIso: string | null | undefined): string {
  if (!dateIso) return "not set";
  const d = new Date(dateIso.length === 10 ? `${dateIso}T12:00:00Z` : dateIso);
  if (!Number.isFinite(d.getTime())) return "not set";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: dateIso.length === 10 ? "UTC" : "America/Chicago",
  });
}

export type Tone = "good" | "navy" | "warn" | "crit" | "muted";

/** Countdown pill content for a due date. */
export function countdown(
  dateIso: string | null | undefined,
  opts: { doneWhen?: boolean; doneLabelDate?: string | null } = {},
): { label: string; tone: Tone } {
  if (!dateIso) return { label: "not set", tone: "muted" };
  if (opts.doneWhen) return { label: `done ${fmtShort(opts.doneLabelDate ?? dateIso)}`, tone: "good" };
  const n = daysUntil(dateIso);
  if (n === null) return { label: "not set", tone: "muted" };
  if (n < 0) return { label: `${-n}d overdue`, tone: "crit" };
  if (n === 0) return { label: "today", tone: "warn" };
  if (n === 1) return { label: "tomorrow", tone: "warn" };
  return { label: `in ${n}d`, tone: n <= 7 ? "warn" : "navy" };
}

/** Latest of a set of ISO timestamps. */
export function latestIso(...vals: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const v of vals) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > bestT) {
      bestT = t;
      best = v;
    }
  }
  return best;
}
