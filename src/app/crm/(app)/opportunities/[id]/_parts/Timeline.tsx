import Link from "next/link";
import { todayIso } from "../../../format";
import { logOpportunityActivity } from "../../actions";
import { ACTIVITY_KINDS } from "../../_lib/labels";
import type { ContactRow } from "./types";

export type TimelineCat = "notes" | "touches" | "stages" | "tasks" | "signals" | "updates";
export type TimelineItem = {
  ts: string;
  icon: string;
  text: string;
  who?: string;
  href?: string;
  cat: TimelineCat;
  scope?: "account";
};

export const TL_FILTERS: { key: string; label: string; cats: TimelineCat[] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "notes", label: "Notes", cats: ["notes"] },
  { key: "touches", label: "Outreach", cats: ["touches"] },
  { key: "stages", label: "Stages", cats: ["stages", "updates"] },
  { key: "tasks", label: "Tasks", cats: ["tasks"] },
  { key: "signals", label: "Signals", cats: ["signals"] },
];

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

/* Ported from the EDC Timeline: the compose row now logs any touch (note,
   email, call, meeting, LinkedIn) with an optional person and date, and the
   feed is this opportunity's events plus its account's. */
export default function Timeline({
  oppId,
  items,
  filter,
  limit,
  people,
}: {
  oppId: string;
  items: TimelineItem[];
  filter: string;
  limit: number;
  people: ContactRow[];
}) {
  const f = TL_FILTERS.find((x) => x.key === filter) ?? TL_FILTERS[0];
  const filtered = f.cats ? items.filter((i) => f.cats!.includes(i.cat)) : items;
  const feed = filtered.slice(0, limit);
  const href = (tl: string, tlLimit?: number) => {
    const p = new URLSearchParams();
    if (tl !== "all") p.set("tl", tl);
    if (tlLimit) p.set("tl_limit", String(tlLimit));
    const q = p.toString();
    return `/crm/opportunities/${oppId}${q ? `?${q}` : ""}#dx-timeline`;
  };

  return (
    <div className="dcardx" id="dx-timeline" style={{ marginTop: 16 }}>
      <div className="ch">
        <h3>Timeline</h3>
        <span className="mini">{filtered.length} EVENTS · OPPORTUNITY + ACCOUNT, ONE FEED</span>
      </div>
      <form className="dform dx-quickadd" action={logOpportunityActivity}>
        <input type="hidden" name="id" value={oppId} />
        <input type="hidden" name="return_to" value={`/crm/opportunities/${oppId}#dx-timeline`} />
        <div className="dx-qarow">
          <div>
            <label htmlFor="tl-kind">LOG</label>
            <select id="tl-kind" name="kind" defaultValue="note">
              {ACTIVITY_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tl-note">WHAT HAPPENED</label>
            <input
              id="tl-note"
              name="body"
              maxLength={20000}
              placeholder="Call with the VP of Ops, demo feedback, the reply to the proposal"
              required
            />
          </div>
          <button className="dbtn dbtn-green dbtn-sm" type="submit">
            Log
          </button>
        </div>
        <details className="dx-edit">
          <summary>Person and date</summary>
          <div className="dx-formgrid">
            <div>
              <label htmlFor="tl-person">WITH</label>
              <select id="tl-person" name="contact_id" defaultValue="">
                <option value="">nobody in particular</option>
                {people.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.title ? ` · ${c.title}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tl-date">DATE</label>
              <input id="tl-date" name="occurred_on" type="date" max={todayIso()} />
            </div>
          </div>
          <p className="dx-help">Emails, calls, meetings and LinkedIn touches also update the account&apos;s last touch.</p>
        </details>
      </form>
      <nav className="dx-chips dx-tlchips" aria-label="Filter the timeline">
        {TL_FILTERS.map((x) => (
          <Link
            key={x.key}
            href={href(x.key, limit > 100 ? limit : undefined)}
            scroll={false}
            className={`fchip2${x.key === f.key ? " on" : ""}`}
            aria-current={x.key === f.key ? "true" : undefined}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {feed.length === 0 ? (
        <div className="empty-note">
          {f.cats
            ? "Nothing of this kind yet."
            : "Everything that happens on this opportunity lands here: notes, emails, calls, meetings, stage moves, tasks, and demo opens on the account."}
        </div>
      ) : (
        <div className="tl">
          {feed.map((ev, i) => (
            <div key={i} className="tl-row">
              <span className="tl-ico" aria-hidden="true">
                {ev.icon}
              </span>
              <div className="tl-body">
                {ev.href ? <Link href={ev.href}>{ev.text}</Link> : <span>{ev.text}</span>}
                <div className="tl-meta">
                  {fmtWhen(ev.ts)}
                  {ev.who ? ` · ${ev.who}` : ""}
                  {ev.scope === "account" ? " · account" : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length > feed.length && limit < 300 ? (
        <div className="dx-tlmore">
          <Link href={href(f.key, 300)} scroll={false}>
            Show older
          </Link>
        </div>
      ) : null}
    </div>
  );
}
