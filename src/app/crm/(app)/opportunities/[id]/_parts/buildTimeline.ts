/* Turns crm_events (this opportunity's and its account's) and the
   opportunity's tasks into one feed. Ported from the EDC buildTimeline; the
   buyer, offer and data-room feeds have no DSO Hire counterpart, and the
   outreach kinds (email, call, meeting, LinkedIn) and demo opens are new.
   Plain module, no I/O. */
import { BILLING_LABELS, initials } from "../../_lib/labels";
import { LOST_REASONS, PLAN_LABELS, fmtMoney, stageLabel } from "../../../format";
import { fmtShort } from "../../_lib/dates";
import type { TimelineItem } from "./Timeline";
import type { Admin, EventRow, TaskRow } from "./types";

type Fmt = "money" | "pct" | "date" | "text" | "admin" | "plan" | "billing" | "silent" | "contact";

const FIELD_LABELS: Record<string, { label: string; fmt: Fmt }> = {
  name: { label: "name", fmt: "text" },
  plan_tier: { label: "plan", fmt: "plan" },
  billing: { label: "billing", fmt: "billing" },
  mrr: { label: "MRR", fmt: "money" },
  close_probability: { label: "probability", fmt: "pct" },
  target_close: { label: "target close", fmt: "date" },
  owner_id: { label: "owner", fmt: "admin" },
  primary_contact_id: { label: "primary contact", fmt: "contact" },
  next_step: { label: "next step", fmt: "text" },
  next_step_due: { label: "next step due", fmt: "date" },
  notes: { label: "notes", fmt: "silent" },
};

function fmtField(fmt: Fmt, v: unknown, admins: Map<string, Admin>, people: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "not set";
  if (fmt === "money") return fmtMoney(Number(v));
  if (fmt === "pct") return `${Number(v)}%`;
  if (fmt === "date") return fmtShort(String(v));
  if (fmt === "admin") return initials(admins.get(String(v))) ?? "another founder";
  if (fmt === "plan") return PLAN_LABELS[String(v)] ?? String(v);
  if (fmt === "billing") return (BILLING_LABELS[String(v)] ?? String(v)).toLowerCase();
  if (fmt === "contact") return people.get(String(v)) ?? "a contact";
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

export function describeFieldChange(
  meta: Record<string, unknown> | null,
  admins: Map<string, Admin>,
  people: Map<string, string>,
): string {
  const fields = (Array.isArray(meta?.fields) ? meta!.fields : []) as string[];
  const from = (meta?.from ?? {}) as Record<string, unknown>;
  const to = (meta?.to ?? {}) as Record<string, unknown>;
  let title = "Economics updated";
  if (fields.every((f) => f === "target_close")) title = "Key dates updated";
  else if (fields.every((f) => f === "owner_id" || f === "name")) title = "Opportunity updated";
  else if (fields.every((f) => f.startsWith("next_step"))) title = "Next step set";
  else if (fields.every((f) => f === "primary_contact_id")) title = "Primary contact set";
  else if (fields.length === 1 && fields[0] === "notes") return "Opportunity notes edited";
  const parts = fields
    .filter((f) => FIELD_LABELS[f]?.fmt !== "silent")
    .map((f) => {
      const d = FIELD_LABELS[f] ?? { label: f.replace(/_/g, " "), fmt: "text" as const };
      return `${d.label} ${fmtField(d.fmt, from[f], admins, people)} to ${fmtField(d.fmt, to[f], admins, people)}`;
    });
  const shown = parts.slice(0, 3).join(", ");
  return `${title}${shown ? `: ${shown}` : ""}${parts.length > 3 ? ` +${parts.length - 3} more` : ""}`;
}

const TOUCH_ICON: Record<string, string> = { email: "✉", call: "☏", meeting: "◷", linkedin: "in" };
const TOUCH_VERB: Record<string, string> = { email: "Email", call: "Call", meeting: "Meeting", linkedin: "LinkedIn" };

export function buildTimeline({
  opp,
  events,
  tasks,
  admins,
  people,
  otherOpps,
}: {
  opp: { id: string; name: string; created_at: string };
  events: EventRow[];
  tasks: TaskRow[];
  admins: Admin[];
  people: Map<string, string>;
  otherOpps: Map<string, string>;
}): TimelineItem[] {
  const adminMap = new Map(admins.map((a) => [a.id, a]));
  const items: TimelineItem[] = [];
  const doneLogged = new Set<string>();
  let openedLogged = false;

  for (const ev of events) {
    const a = ev.created_by ? adminMap.get(ev.created_by) : undefined;
    const who = a ? (a.full_name ?? a.email ?? undefined) : undefined;
    const m = (ev.meta ?? {}) as Record<string, unknown>;
    const elsewhere = ev.opportunity_id && ev.opportunity_id !== opp.id ? otherOpps.get(ev.opportunity_id) : undefined;
    const account = !ev.opportunity_id;
    const suffix = elsewhere ? ` (on ${elsewhere})` : "";
    const href = elsewhere ? `/crm/opportunities/${ev.opportunity_id}` : undefined;
    const person = ev.contact_id ? people.get(ev.contact_id) : undefined;
    const base = { ts: ev.occurred_at, who, href, scope: account ? ("account" as const) : undefined };

    if (ev.kind === "note") {
      items.push({ ...base, icon: "✎", text: `${ev.body ?? ""}${suffix}`, cat: "notes" });
    } else if (ev.kind in TOUCH_ICON) {
      items.push({
        ...base,
        icon: TOUCH_ICON[ev.kind],
        text: `${TOUCH_VERB[ev.kind]}${person ? ` with ${person}` : ""}: ${ev.body ?? ""}${suffix}`,
        cat: "touches",
      });
    } else if (ev.kind === "stage_change") {
      items.push({
        ...base,
        icon: "→",
        text: `Stage moved${m.from ? ` from ${stageLabel(String(m.from))}` : ""} to ${stageLabel(String(m.to ?? ""))}${suffix}`,
        cat: "stages",
      });
    } else if (ev.kind === "won") {
      items.push({ ...base, icon: "★", text: `Won${m.from ? ` from ${stageLabel(String(m.from))}` : ""}${suffix}`, cat: "stages" });
    } else if (ev.kind === "lost") {
      const reason = m.reason ? LOST_REASONS[String(m.reason)] : null;
      items.push({ ...base, icon: "✕", text: `Marked lost: ${ev.body ?? reason ?? "no reason logged"}${suffix}`, cat: "stages" });
    } else if (ev.kind === "field_change") {
      if (elsewhere) continue;
      items.push({ ...base, icon: "✎", text: describeFieldChange(ev.meta, adminMap, people), cat: "updates" });
    } else if (ev.kind === "task_done") {
      if (m.task_id) doneLogged.add(String(m.task_id));
      items.push({ ...base, icon: "☑", text: `Task completed: ${ev.body ?? ""}${suffix}`, cat: "tasks" });
    } else if (ev.kind === "demo_open") {
      items.push({ ...base, icon: "◉", text: ev.body ?? "Opened the live demo", cat: "signals" });
    } else if (ev.kind === "lead") {
      items.push({ ...base, icon: "◆", text: ev.body ?? "Inbound lead", cat: "signals" });
    } else if (ev.kind === "import") {
      if (ev.opportunity_id === opp.id) openedLogged = true;
      items.push({ ...base, icon: "◆", text: `${ev.body ?? "Added"}${suffix}`, cat: "updates" });
    }
  }

  if (!openedLogged) items.push({ ts: opp.created_at, icon: "◆", text: `Opportunity opened: ${opp.name}`, cat: "updates" });

  for (const t of tasks) {
    if (t.created_at) items.push({ ts: t.created_at, icon: "☐", text: `Task added: ${t.title}`, cat: "tasks" });
    if (t.completed_at && !doneLogged.has(t.id))
      items.push({ ts: t.completed_at, icon: "☑", text: `Task completed: ${t.title}`, cat: "tasks" });
  }

  return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}
