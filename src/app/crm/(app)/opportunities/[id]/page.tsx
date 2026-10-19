import Link from "next/link";
import { notFound } from "next/navigation";
import { crmPageGate } from "@/lib/crm/auth";
import { UUID_RE } from "@/lib/crm/events";
import ActionError from "../../ActionError";
import StickyIdentity from "../../StickyIdentity";
import {
  LOST_REASONS,
  effectiveStages,
  nowMs as nowMsOf,
  oppProbability,
  parseStageWeights,
  stageLabel,
  stageWeight,
  suggestPlan,
} from "../../format";
import { reopenOpportunity, setOpportunityCustomStages, updateOpportunityNotes } from "../actions";
import { countdown, daysAgo, daysUntil, fmtShort, latestIso } from "../_lib/dates";
import { oppHealth } from "../_lib/health";
import { adminsOf } from "../_lib/server";
import { buildTimeline } from "./_parts/buildTimeline";
import EconStrip from "./_parts/EconStrip";
import HealthCard from "./_parts/HealthCard";
import KeyDates from "./_parts/KeyDates";
import NextStep from "./_parts/NextStep";
import OppHeader from "./_parts/OppHeader";
import OppTasks from "./_parts/OppTasks";
import PrimaryContact from "./_parts/PrimaryContact";
import Timeline from "./_parts/Timeline";
import type { AccountRow, ContactRow, EventRow, OppRow, TaskRow } from "./_parts/types";
import "../opportunities.css";

export default async function OpportunityRecord({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tl?: string; tl_limit?: string }>;
}) {
  const { id } = await params;
  const gate = await crmPageGate(`/crm/opportunities/${id}`);
  if (gate === "denied" || gate === "needs_mfa") return null;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const tlLimit = sp.tl_limit === "300" ? 300 : 100;
  const { supabase } = gate;
  const admins = adminsOf(gate);
  const nowMs = nowMsOf();

  const { data: oppData } = await supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle();
  const opp = oppData as OppRow | null;
  if (!opp) notFound();

  const [accountRes, contactsRes, tasksRes, eventsRes, siblingsRes, settingsRes] = await Promise.all([
    supabase
      .from("crm_accounts")
      .select("id, name, hq_state, locations, status, website, last_touch_at, current_tool")
      .eq("id", opp.account_id)
      .maybeSingle(),
    supabase
      .from("crm_contacts")
      .select("id, name, title, role, email, phone, linkedin_url")
      .eq("account_id", opp.account_id)
      .order("created_at"),
    supabase
      .from("crm_tasks")
      .select("*")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("crm_events")
      .select("id, kind, body, meta, occurred_at, created_by, opportunity_id, contact_id")
      .or(`opportunity_id.eq.${id},account_id.eq.${opp.account_id}`)
      .order("occurred_at", { ascending: false })
      .limit(tlLimit),
    supabase.from("crm_opportunities").select("id, name").eq("account_id", opp.account_id),
    supabase.from("crm_workspace_settings").select("stage_weights").eq("id", true).maybeSingle(),
  ]);

  const account = (accountRes.data ?? null) as AccountRow;
  const contacts = (contactsRes.data ?? []) as ContactRow[];
  const tasks = (tasksRes.data ?? []) as TaskRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const weights = parseStageWeights(settingsRes.data?.stage_weights);
  const otherOpps = new Map(
    ((siblingsRes.data ?? []) as { id: string; name: string }[]).filter((o) => o.id !== id).map((o) => [o.id, o.name]),
  );
  const people = new Map(contacts.map((c) => [c.id, c.name]));

  /* ---- economics and health, computed once ---- */
  const prob = {
    value: Math.round(oppProbability(opp, weights) * 100),
    source: typeof opp.close_probability === "number" ? ("set" as const) : ("stage" as const),
  };
  const stageDefaultPct = Math.round(stageWeight(opp.stage, opp.custom_stages, weights) * 100);
  const openTasks = tasks.filter((t) => !t.completed_at);
  const lastOppEvent = events.find((e) => e.opportunity_id === id)?.occurred_at;
  const lastActivityAt = latestIso(lastOppEvent, account?.last_touch_at, opp.stage_changed_at, opp.created_at);
  const health =
    opp.stage === "lost"
      ? null
      : oppHealth({
          opp,
          openTasks: openTasks.map((t) => ({
            ball: t.ball,
            due_date: t.due_date,
            waiting_since: t.waiting_since,
            priority: t.priority,
          })),
          lastActivityAt,
          nowMs,
        });
  const nsDue = opp.next_step ? daysUntil(opp.next_step_due) : null;

  const stages = effectiveStages(opp.custom_stages);
  const stageIdx = stages.indexOf(opp.stage);
  const inStage = daysAgo(opp.stage_changed_at ?? opp.created_at, nowMs) ?? 0;
  const tc = countdown(opp.target_close);

  const timeline = buildTimeline({ opp, events, tasks, admins, people, otherOpps });

  return (
    <div className="dx-page">
      <ActionError error={sp.error} />
      <StickyIdentity watch="dx-head">
        <b>{opp.name}</b>
        <span className="pill navy">{stageLabel(opp.stage).toUpperCase()}</span>
        {account ? <span className="dx-muted">{account.name}</span> : null}
      </StickyIdentity>

      {opp.stage === "lost" ? (
        <div className="dx-lostbanner" role="status">
          <span>
            <b>LOST</b>
            {opp.lost_at ? ` ${fmtShort(opp.lost_at)}` : ""}
            {opp.lost_reason ? ` · ${LOST_REASONS[opp.lost_reason] ?? opp.lost_reason}` : ""}
            {opp.lost_note ? `: ${opp.lost_note}` : ""}
          </span>
          <form action={reopenOpportunity}>
            <input type="hidden" name="id" value={opp.id} />
            <button className="dbtn dbtn-line dbtn-sm" type="submit">
              Reopen
            </button>
          </form>
        </div>
      ) : null}

      <OppHeader opp={opp} account={account} health={health} admins={admins} />

      <div className="flowcard" id="dx-flow">
        <div className="flowhead">
          <b>SALES FLOW</b>
          {opp.stage !== "lost" && opp.stage !== "won" ? (
            <span className="dx-flowmeta">
              DAY {inStage + 1} IN STAGE
              {opp.target_close
                ? ` · TARGET CLOSE ${fmtShort(opp.target_close).toUpperCase()} (${tc.label.toUpperCase()})`
                : ""}
            </span>
          ) : null}
          <span className="mini">
            {stageIdx >= 0
              ? `${stageIdx + 1} OF ${stages.length} · ${stageLabel(opp.stage).toUpperCase()}`
              : stageLabel(opp.stage).toUpperCase()}
          </span>
        </div>
        <div className="flowbar">
          {stages.map((s, i) => (
            <div key={s} className={`fnode${i < stageIdx ? " done" : i === stageIdx ? " cur" : ""}`}>
              <span className="fdot" />
              <span className="flab">{stageLabel(s).toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      <EconStrip opp={opp} prob={prob} stageDefaultPct={stageDefaultPct} suggestedPlan={suggestPlan(account?.locations)} />
      <KeyDates opp={opp} />
      <NextStep opp={opp} admins={admins} />

      <div className="dgrid">
        <div>
          <OppTasks opp={opp} tasks={tasks} admins={admins} people={contacts} nowMs={nowMs} />
        </div>

        <div>
          <HealthCard
            health={health}
            daysInStage={inStage}
            touchDays={daysAgo(account?.last_touch_at, nowMs)}
            nextStepOverdue={nsDue !== null && nsDue <= 0 ? -nsDue : null}
          />
          <PrimaryContact opp={opp} contacts={contacts} />

          <div className="dcardx" id="dx-notes">
            <div className="ch">
              <h3>Notes</h3>
            </div>
            <form action={updateOpportunityNotes} className="dform">
              <input type="hidden" name="id" value={opp.id} />
              <label htmlFor="dx-notes-text" className="ws-sr">
                Opportunity notes
              </label>
              <textarea id="dx-notes-text" name="notes" rows={5} maxLength={20000} defaultValue={opp.notes ?? ""} />
              <div>
                <button className="dbtn dbtn-line dbtn-sm" type="submit">
                  Save notes
                </button>
              </div>
            </form>
          </div>

          {otherOpps.size > 0 ? (
            <div className="dcardx">
              <div className="ch">
                <h3>Other opportunities</h3>
                <span className="mini">SAME ACCOUNT</span>
              </div>
              {Array.from(otherOpps.entries()).map(([oid, name]) => (
                <div key={oid} className="kvrow">
                  <span className="k2">
                    <Link href={`/crm/opportunities/${oid}`}>{name}</Link>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="dcardx" id="dx-stages">
            <div className="ch">
              <h3>Stage list</h3>
              <span className="mini">{opp.custom_stages ? "CUSTOM" : "DSO HIRE TEMPLATE"}</span>
            </div>
            <form action={setOpportunityCustomStages} className="dform">
              <input type="hidden" name="id" value={opp.id} />
              <div>
                <label htmlFor="dx-stages-list">STAGES, IN ORDER, COMMA-SEPARATED</label>
                <textarea
                  id="dx-stages-list"
                  name="stages"
                  rows={3}
                  defaultValue={opp.custom_stages ? opp.custom_stages.join(", ") : ""}
                  placeholder={
                    "Standard template: " +
                    effectiveStages(null).map(stageLabel).join(", ") +
                    ". Enter your own list to customize this opportunity, e.g. target, discovery, pilot, won. Leave empty to use the template."
                  }
                />
              </div>
              <div>
                <button className="dbtn dbtn-line" type="submit">
                  Save stage list
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <Timeline oppId={opp.id} items={timeline} filter={sp.tl ?? "all"} limit={tlLimit} people={contacts} />
    </div>
  );
}
