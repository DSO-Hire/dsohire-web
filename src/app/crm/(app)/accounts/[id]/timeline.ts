/* One feed for an account: crm_events plus the demo_visits summary for the
   account's personalized demo link. Shared by the Overview's recent list
   and the Activity tab. */

import { ACCOUNT_STATUS_LABELS, EVENT_LABELS, fmtDate, relTime, stageLabel } from "../../format";
import type { DemoVisit } from "../lib";
import type { ContactRec, EventRec, OppRec } from "./types";

export type FeedItem = {
  key: string;
  ts: string;
  icon: string;
  group: string;
  label: string;
  text: string;
  who?: string;
  href?: string;
};

export const FEED_FILTERS: [string, string][] = [
  ["touch", "Emails, calls, meetings"],
  ["note", "Notes"],
  ["pipeline", "Pipeline"],
  ["task", "Tasks"],
  ["demo", "Demo"],
  ["record", "Record changes"],
];

const ICON: Record<string, string> = {
  email: "✉",
  call: "☎",
  meeting: "◉",
  linkedin: "in",
  note: "✎",
  stage_change: "→",
  field_change: "•",
  demo_open: "▶",
  lead: "★",
  won: "✓",
  lost: "×",
  task_done: "☑",
  import: "+",
};

const GROUP: Record<string, string> = {
  email: "touch",
  call: "touch",
  meeting: "touch",
  linkedin: "touch",
  note: "note",
  stage_change: "pipeline",
  won: "pipeline",
  lost: "pipeline",
  task_done: "task",
  demo_open: "demo",
  field_change: "record",
  import: "record",
  lead: "record",
};

export function buildFeed({
  events,
  contacts,
  opps,
  demo,
  me,
  myName,
}: {
  events: EventRec[];
  contacts: ContactRec[];
  opps: OppRec[];
  demo: DemoVisit | null;
  me: string;
  myName: string;
}): FeedItem[] {
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const oppName = new Map(opps.map((o) => [o.id, o.name]));
  const items: FeedItem[] = [];
  for (const e of events) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    let text = e.body ?? "";
    if (e.kind === "stage_change" && !text) {
      const from = typeof meta.from === "string" ? stageLabel(meta.from) : null;
      const to = typeof meta.to === "string" ? stageLabel(meta.to) : "";
      text = `Stage moved${from ? ` from ${from}` : ""} to ${to}`;
    } else if (e.kind === "field_change" && !text && Array.isArray(meta.changes)) {
      text = (meta.changes as { field?: string; to?: unknown }[])
        .map((c) =>
          c.field === "status"
            ? `Status set to ${ACCOUNT_STATUS_LABELS[String(c.to)] ?? String(c.to)}`
            : `${String(c.field ?? "Field")} updated`,
        )
        .join(". ");
    }
    const contact = e.contact_id ? contactName.get(e.contact_id) : null;
    const opp = e.opportunity_id ? oppName.get(e.opportunity_id) : null;
    const label = EVENT_LABELS[e.kind] ?? e.kind;
    items.push({
      key: e.id,
      ts: e.occurred_at,
      icon: ICON[e.kind] ?? "·",
      group: GROUP[e.kind] ?? "record",
      label,
      text: text || label,
      who: [
        contact ? `with ${contact}` : null,
        opp ? `on ${opp}` : null,
        e.created_by ? (e.created_by === me ? myName : "another admin") : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: e.opportunity_id ? `/crm/opportunities/${e.opportunity_id}` : undefined,
    });
  }
  if (demo) {
    items.push({
      key: `demo-${demo.for_key}`,
      ts: demo.last_seen_at,
      icon: ICON.demo_open,
      group: "demo",
      label: "Demo",
      text:
        demo.visits > 1
          ? `Opened the personalized demo ${demo.visits} times, last seen ${lastSeen(demo.last_seen_at)}`
          : `Opened the personalized demo, ${lastSeen(demo.last_seen_at)}`,
    });
  }
  return items.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
}

/* "3d ago" inside a week, the date after that. */
export function lastSeen(iso: string): string {
  const r = relTime(iso);
  if (r === "now") return "just now";
  return /^\d+[mhd]$/.test(r) ? `${r} ago` : fmtDate(iso);
}

export function fmtWhen(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    })
    .toUpperCase();
}
