/*
 * Report math as pure functions: rows in, numbers out, no Supabase. Ported
 * from the EDC CRM. Stage history comes from crm_events rows on an
 * opportunity whose meta carries {from, to} (stage_change, won, lost);
 * time before the first recorded move is folded into the first interval
 * from created_at.
 */
import { TEMPLATE_STAGES } from "../format";

export type MOpp = {
  id: string;
  name: string;
  stage: string;
  account_id: string;
  created_at: string;
  updated_at: string;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  owner_id?: string | null;
};
export type MEvent = {
  opportunity_id: string | null;
  account_id: string;
  kind: string;
  meta: { from?: string; to?: string; reason?: string } | null;
  occurred_at: string;
  created_by?: string | null;
};
export type Interval = { stage: string; enteredAt: string; leftAt: string | null };

const DAY = 86_400_000;
const STAGE_IDX = new Map<string, number>(TEMPLATE_STAGES.map((s, i) => [s, i]));

export function stageIndex(stage: string | null | undefined): number {
  return stage ? STAGE_IDX.get(stage) ?? -1 : -1;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const days = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DAY);

/* an opportunity's stage moves, oldest first */
export function stageChanges(oppId: string, events: MEvent[]): MEvent[] {
  return events
    .filter((e) => e.opportunity_id === oppId && typeof e.meta?.to === "string")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

export function stageHistory(opp: MOpp, events: MEvent[]): Interval[] {
  const ch = stageChanges(opp.id, events);
  if (ch.length === 0) return [{ stage: opp.stage, enteredAt: opp.created_at, leftAt: null }];
  const out: Interval[] = [{ stage: ch[0].meta?.from ?? opp.stage, enteredAt: opp.created_at, leftAt: ch[0].occurred_at }];
  ch.forEach((e, i) => {
    out.push({ stage: e.meta?.to ?? opp.stage, enteredAt: e.occurred_at, leftAt: ch[i + 1]?.occurred_at ?? null });
  });
  return out;
}

/* Furthest template stage an opportunity ever touched (lost does not count). */
export function maxStageReached(opp: MOpp, events: MEvent[]): number {
  let max = opp.stage === "lost" ? -1 : stageIndex(opp.stage);
  for (const e of stageChanges(opp.id, events)) {
    max = Math.max(max, stageIndex(e.meta?.from), stageIndex(e.meta?.to));
  }
  return max;
}

export function medianDaysByStage(
  intervals: Interval[],
  since: string | null = null,
): { stage: string; medianDays: number; n: number }[] {
  const by = new Map<string, number[]>();
  for (const iv of intervals) {
    if (!iv.leftAt || iv.stage === "won" || iv.stage === "lost") continue;
    if (since && iv.leftAt < since) continue;
    const arr = by.get(iv.stage) ?? [];
    arr.push(days(iv.enteredAt, iv.leftAt));
    by.set(iv.stage, arr);
  }
  const order = (s: string) => (STAGE_IDX.has(s) ? STAGE_IDX.get(s)! : 99);
  return [...by.entries()]
    .map(([stage, xs]) => ({ stage, medianDays: median(xs) ?? 0, n: xs.length }))
    .sort((a, b) => order(a.stage) - order(b.stage) || a.stage.localeCompare(b.stage));
}

export function currentStageAge(
  opp: MOpp & { stage_changed_at?: string | null },
  events: MEvent[],
  now: number = Date.now(),
): number {
  const into = stageChanges(opp.id, events).filter((e) => e.meta?.to === opp.stage);
  const from = into.length ? into[into.length - 1].occurred_at : opp.stage_changed_at ?? opp.updated_at;
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / DAY));
}

export type Step = { label: string; value: number };

const OUTREACH = new Set(["email", "call", "meeting", "linkedin"]);

/* Outbound funnel. Accounts follow the range by created date; touches by
   the event date; opportunity steps by the opportunity's created date. */
export function funnel(
  accounts: { id: string; created_at: string }[],
  opps: MOpp[],
  events: MEvent[],
  since: string | null,
): Step[] {
  const inRange = (iso: string) => !since || iso >= since;
  const touched = new Set(events.filter((e) => OUTREACH.has(e.kind) && inRange(e.occurred_at)).map((e) => e.account_id));
  const ro = opps.filter((o) => inRange(o.created_at));
  const reached = (stage: string) => {
    const idx = stageIndex(stage);
    return ro.filter((o) => maxStageReached(o, events) >= idx).length;
  };
  return [
    { label: "Accounts added", value: accounts.filter((a) => inRange(a.created_at)).length },
    { label: "Accounts touched", value: touched.size },
    { label: "Opportunities opened", value: ro.length },
    { label: "Reached discovery", value: reached("discovery") },
    { label: "Reached demo", value: reached("demo") },
    { label: "Reached proposal", value: reached("proposal") },
    { label: "Won", value: ro.filter((o) => o.stage === "won").length },
  ];
}

export type Outcome = {
  opp: MOpp;
  outcome: "won" | "lost";
  at: string;
  reason: string | null;
  stageAtLoss: string | null;
  daysToOutcome: number;
};

export function winLoss(opps: MOpp[], events: MEvent[], since: string | null) {
  const outcomes: Outcome[] = [];
  for (const o of opps) {
    if (o.stage !== "won" && o.stage !== "lost") continue;
    const ch = stageChanges(o.id, events).filter((e) => e.meta?.to === o.stage);
    const last = ch[ch.length - 1] ?? null;
    const at = (o.stage === "won" ? o.won_at : o.lost_at) ?? last?.occurred_at ?? o.updated_at;
    if (since && at < since) continue;
    outcomes.push({
      opp: o,
      outcome: o.stage,
      at,
      reason: o.stage === "lost" ? (o.lost_reason && o.lost_reason.trim()) || "Not recorded" : null,
      stageAtLoss: o.stage === "lost" ? last?.meta?.from ?? null : null,
      daysToOutcome: Math.round(days(o.created_at, at)),
    });
  }
  const won = outcomes.filter((x) => x.outcome === "won");
  const lost = outcomes.filter((x) => x.outcome === "lost");
  const count = (xs: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x ?? "Not recorded", (m.get(x ?? "Not recorded") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    won,
    lost,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    medianDaysToClose: median(won.map((x) => x.daysToOutcome)),
    reasons: count(lost.map((x) => x.reason)),
    stagesAtLoss: count(lost.map((x) => x.stageAtLoss)),
  };
}
