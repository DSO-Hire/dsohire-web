/* Pipeline loader: one pass over opportunities, open tasks, and recent
   events, reduced to a PipelineOpp per opportunity. Ported from the EDC
   pipeline loader; deal economics (EV, fee) become subscription economics
   (MRR, ACV, stage-weighted ACV). Server-only by use (it takes the
   request-scoped client); no "use server" exports. */
import type { CrmSession } from "@/lib/crm/auth";
import { oppAcv, oppMrr, oppProbability, parseStageWeights, weightedAcv } from "../../format";
import { daysAgo, latestIso } from "../../opportunities/_lib/dates";
import { oppHealth, type Health } from "../../opportunities/_lib/health";
import { stageGroup, type StageGroup } from "../../opportunities/_lib/labels";

type Supa = CrmSession["supabase"];

export type PipelineOpp = {
  id: string;
  name: string;
  stage: string;
  custom_stages: string[] | null;
  account_id: string;
  account: { name?: string; hq_state?: string | null; locations?: number | null; last_touch_at?: string | null } | null;
  owner_id: string | null;
  plan_tier: string | null;
  billing: string | null;
  mrrSet: boolean;
  mrr: number;
  acv: number;
  probability: number;
  probabilitySource: "set" | "stage";
  weighted: number;
  next_step: string | null;
  next_step_due: string | null;
  target_close: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  lost_at: string | null;
  won_at: string | null;
  health: Health | null;
  group: StageGroup;
  daysInStage: number;
  lastActivityDays: number | null;
  openTaskCount: number;
  overdueCount: number;
  oldestTask: { ball: string; days: number; title: string } | null;
};

export type PipelineFilters = {
  owner: string;
  group: string;
  plan: string;
  stale: boolean;
};

export async function loadPipeline(supabase: Supa, today: string, nowMs: number) {
  const [oppsRes, tasksRes, eventsRes, settingsRes] = await Promise.all([
    supabase
      .from("crm_opportunities")
      .select("*, crm_accounts(name, hq_state, locations, last_touch_at)")
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("crm_tasks")
      .select("opportunity_id, ball, due_date, waiting_since, priority, title, owner_id")
      .is("completed_at", null)
      .not("opportunity_id", "is", null)
      .limit(2000),
    supabase
      .from("crm_events")
      .select("opportunity_id, occurred_at")
      .not("opportunity_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase.from("crm_workspace_settings").select("stage_weights").eq("id", true).maybeSingle(),
  ]);

  const weights = parseStageWeights(settingsRes.data?.stage_weights);

  type TaskLite = {
    opportunity_id: string;
    ball: string;
    due_date: string | null;
    waiting_since: string | null;
    priority: string | null;
    title: string;
    owner_id: string | null;
  };
  const tasksByOpp = new Map<string, TaskLite[]>();
  for (const t of (tasksRes.data ?? []) as TaskLite[]) {
    const list = tasksByOpp.get(t.opportunity_id) ?? [];
    list.push(t);
    tasksByOpp.set(t.opportunity_id, list);
  }
  const lastEvent = new Map<string, string>();
  for (const e of (eventsRes.data ?? []) as { opportunity_id: string; occurred_at: string }[]) {
    if (!lastEvent.has(e.opportunity_id)) lastEvent.set(e.opportunity_id, e.occurred_at);
  }

  const opps: PipelineOpp[] = ((oppsRes.data ?? []) as Record<string, unknown>[]).map((o) => {
    const id = String(o.id);
    const stage = String(o.stage);
    const custom = (o.custom_stages as string[] | null) ?? null;
    const account = (o.crm_accounts as PipelineOpp["account"]) ?? null;
    const econ = {
      mrr: o.mrr as number | string | null,
      plan_tier: (o.plan_tier as string | null) ?? null,
      billing: (o.billing as string | null) ?? null,
      stage,
      custom_stages: custom,
      close_probability: (o.close_probability as number | null) ?? null,
    };
    const tasks = tasksByOpp.get(id) ?? [];
    const lastActivityAt = latestIso(
      lastEvent.get(id),
      account?.last_touch_at ?? null,
      (o.stage_changed_at as string) ?? null,
      o.created_at as string,
    );
    const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
    const waiting = tasks
      .filter((t) => t.ball !== "us")
      .map((t) => ({ ball: t.ball, title: t.title, days: daysAgo(t.waiting_since, nowMs) ?? 0 }))
      .sort((a, b) => b.days - a.days)[0];
    const health =
      stage === "lost"
        ? null
        : oppHealth({
            opp: {
              stage,
              stage_changed_at: (o.stage_changed_at as string | null) ?? null,
              created_at: (o.created_at as string | null) ?? null,
              next_step: (o.next_step as string | null) ?? null,
              next_step_due: (o.next_step_due as string | null) ?? null,
              target_close: (o.target_close as string | null) ?? null,
            },
            openTasks: tasks,
            lastActivityAt,
            nowMs,
          });
    const probSet = typeof econ.close_probability === "number";
    return {
      id,
      name: String(o.name),
      stage,
      custom_stages: custom,
      account_id: String(o.account_id),
      account,
      owner_id: (o.owner_id as string | null) ?? null,
      plan_tier: econ.plan_tier,
      billing: econ.billing,
      mrrSet: o.mrr !== null && o.mrr !== undefined && o.mrr !== "",
      mrr: oppMrr(econ),
      acv: oppAcv(econ),
      probability: Math.round(oppProbability(econ, weights) * 100),
      probabilitySource: probSet ? "set" : "stage",
      weighted: stage === "lost" ? 0 : weightedAcv(econ, weights),
      next_step: (o.next_step as string | null) ?? null,
      next_step_due: (o.next_step_due as string | null) ?? null,
      target_close: (o.target_close as string | null) ?? null,
      lost_reason: (o.lost_reason as string | null) ?? null,
      lost_note: (o.lost_note as string | null) ?? null,
      lost_at: (o.lost_at as string | null) ?? null,
      won_at: (o.won_at as string | null) ?? null,
      health,
      group: stageGroup(stage, custom),
      daysInStage: daysAgo((o.stage_changed_at as string | null) ?? (o.created_at as string), nowMs) ?? 0,
      lastActivityDays: daysAgo(lastActivityAt, nowMs),
      openTaskCount: tasks.length,
      overdueCount: overdue.length,
      oldestTask: waiting ?? null,
    };
  });

  return {
    opps,
    weights,
    error: oppsRes.error ? oppsRes.error.message : null,
    overdueTotal: ((tasksRes.data ?? []) as TaskLite[]).filter((t) => t.due_date && t.due_date < today).length,
  };
}

export function applyFilters(opps: PipelineOpp[], f: PipelineFilters, meId: string): PipelineOpp[] {
  return opps.filter((d) => {
    if (d.stage === "lost") return false;
    if (f.owner === "me" && d.owner_id !== meId) return false;
    if (f.owner !== "all" && f.owner !== "me" && d.owner_id !== f.owner) return false;
    if (f.group !== "all" && d.group !== f.group) return false;
    if (f.plan !== "all" && (d.plan_tier ?? "none") !== f.plan) return false;
    if (f.stale && d.health?.level !== "crit") return false;
    return true;
  });
}

/* re-exported for server callers; client components import ./tone directly */
export { staleTone } from "./tone";
