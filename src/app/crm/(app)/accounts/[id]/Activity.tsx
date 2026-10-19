import Link from "next/link";
import { logOutreach } from "../actions";
import { OUTREACH_KINDS } from "../lib";
import { Hidden } from "../ui";
import { FEED_FILTERS, buildFeed, fmtWhen } from "./timeline";
import type { SectionProps } from "./types";

export default function Activity({ a, contacts, opps, events, demo, today, me, admin, sp }: SectionProps) {
  const myName = admin.full_name?.split(/\s+/)[0] ?? "You";
  const items = buildFeed({ events, contacts, opps, demo, me, myName });
  const active = new Set(
    String(sp.kinds ?? "")
      .split(",")
      .filter((k) => FEED_FILTERS.some(([f]) => f === k)),
  );
  const feed = items.filter((i) => !active.size || active.has(i.group)).slice(0, 200);
  const base = `/crm/accounts/${a.id}?tab=activity`;
  const chipHref = (k: string | null) => {
    if (!k) return base;
    const next = new Set(active);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next.size ? `${base}&kinds=${[...next].join(",")}` : base;
  };

  return (
    <div className="dcardx">
      <div className="ch">
        <h3>Activity</h3>
        <span className="mini">{feed.length} EVENTS · ACCOUNT, OPPORTUNITIES AND DEMO, ONE FEED</span>
      </div>
      <form className="sl-compose" action={logOutreach}>
        <Hidden values={{ account_id: a.id, tab: "activity" }} />
        <div className="sl-compose-row">
          <select name="kind" defaultValue="email" aria-label="What kind of touch">
            {Object.entries(OUTREACH_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <span className="sl-inline-l">ON</span>
          <input type="date" name="occurred_on" defaultValue={today} max={today} aria-label="When it happened" />
          {contacts.length ? (
            <>
              <span className="sl-inline-l">WITH</span>
              <select name="contact_id" defaultValue="" aria-label="Who it was with (optional)">
                <option value="">No one in particular</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
        <textarea
          name="body"
          rows={3}
          maxLength={20000}
          required
          placeholder="What was sent or said, and what they said back"
          aria-label="What happened"
        />
        <div className="sl-compose-row">
          <span className="sl-inline-l">NEXT STEP</span>
          <input name="next_step" maxLength={300} placeholder="Optional, replaces the current one" className="ac-grow" aria-label="Next step (optional)" />
          <input type="date" name="next_step_due" min={today} aria-label="Next step due (optional)" />
          <button className="dbtn dbtn-green dbtn-sm" type="submit">
            Log it
          </button>
        </div>
        <span className="sl-help">
          Emails, calls, meetings and LinkedIn count as touches and move Last touch. A first touch moves a Target to
          Contacted. Notes stay internal.
        </span>
      </form>
      <div className="sl-chips">
        <span className="sl-chips-l">SHOW</span>
        <Link className={`fchip2${!active.size ? " on" : ""}`} href={chipHref(null)}>
          All
        </Link>
        {FEED_FILTERS.map(([k, label]) => (
          <Link key={k} className={`fchip2${active.has(k) ? " on" : ""}`} href={chipHref(k)}>
            {label}
          </Link>
        ))}
      </div>
      {feed.length === 0 ? (
        <div className="empty-note">
          {items.length
            ? "Nothing of that kind yet. Pick another filter or show all."
            : "Everything that happens with this group lands here: emails, calls, meetings, notes, status moves, opportunity stages, finished tasks and demo opens. Log the first touch above."}
        </div>
      ) : (
        <div className="tl ac-tl-full">
          {feed.map((ev) => (
            <div key={ev.key} className="tl-row">
              <span className="tl-ico">{ev.icon}</span>
              <div className="tl-body">
                {ev.href ? <Link href={ev.href}>{ev.text}</Link> : <span className="ac-pre">{ev.text}</span>}
                <div className="tl-meta">
                  {ev.label.toUpperCase()} · {fmtWhen(ev.ts)}
                  {ev.who ? ` · ${ev.who}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {items.length >= 200 ? <div className="sl-note">Showing the newest 200 events.</div> : null}
    </div>
  );
}
