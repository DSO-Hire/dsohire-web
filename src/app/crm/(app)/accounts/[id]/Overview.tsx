import Link from "next/link";
import { toggleTask } from "../../_workspace/actions";
import {
  ACCOUNT_STATUS_LABELS,
  BALL_LABELS,
  CONTACT_ROLE_LABELS,
  PLAN_LABELS,
  SOURCE_LABELS,
  fmtDate,
  fmtMoney,
  oppMrr,
  planMonthly,
  relTime,
  stageLabel,
  suggestPlan,
} from "../../format";
import {
  addAccountTask,
  archiveAccount,
  setAccountOwner,
  startOpportunity,
  updateAccount,
} from "../actions";
import CopyLink from "../CopyLink";
import { BALL_OPTS, FIT_LABELS, PRIORITY_OPTS, WARMTH_LABELS, hrefOf } from "../lib";
import { Area, DateIn, Hidden, KV, NumIn, Sel, Txt } from "../ui";
import { buildFeed, fmtWhen, lastSeen } from "./timeline";
import type { SectionProps } from "./types";

export default function Overview({
  a,
  contacts,
  opps,
  openTasks,
  doneTasks,
  events,
  demo,
  demoLink,
  today,
  me,
  admin,
}: SectionProps) {
  const plan = suggestPlan(a.locations);
  const planPrice = planMonthly(plan, "monthly");
  const due = a.next_step_due ? String(a.next_step_due).slice(0, 10) : null;
  const myName = admin.full_name?.split(/\s+/)[0] ?? "You";
  const recent = buildFeed({ events, contacts, opps, demo, me, myName }).slice(0, 6);
  const openOpps = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const closedOpps = opps.filter((o) => o.stage === "won" || o.stage === "lost");
  const back = { account_id: a.id, tab: "overview" };
  const contactOpts = contacts.map((c) => [c.id, c.title ? `${c.name}, ${c.title}` : c.name] as [string, string]);
  const archived = !!a.archived_at;

  const startForm = (first: boolean) => (
    <form action={startOpportunity} className="dform">
      <Hidden values={{ account_id: a.id }} />
      <div className="frow2">
        <Sel
          idp={first ? "so1" : "so2"}
          name="stage"
          label="START AT"
          value={a.status === "target" ? "target" : "contacted"}
          opts={[
            ["target", "Target"],
            ["contacted", "Contacted"],
          ]}
          empty={null}
        />
        <Sel
          idp={first ? "so1" : "so2"}
          name="primary_contact_id"
          label="PRIMARY CONTACT"
          value={contacts.find((c) => c.role === "decision_maker")?.id ?? null}
          opts={contactOpts}
          empty="None yet"
        />
      </div>
      <p className="ac-hint">
        Named {a.name}.{" "}
        {plan
          ? `Plan set to ${PLAN_LABELS[plan]} from ${a.locations} locations${planPrice ? ` (${fmtMoney(planPrice)}/mo list)` : ""}; change it on the opportunity.`
          : "Add a location count to suggest a plan."}
      </p>
      <div>
        <button className="dbtn dbtn-green dbtn-sm" type="submit" disabled={archived}>
          {first ? "Start opportunity" : "Start another opportunity"}
        </button>
      </div>
    </form>
  );

  return (
    <>
      <div className="econ sl-econ5">
        <div className="etile">
          <div className="el">LOCATIONS</div>
          <div className="ev">{a.locations ?? "n/a"}</div>
          <div className="es">{a.locations_note ? a.locations_note.toUpperCase().slice(0, 40) : a.hq_state ? `HQ ${a.hq_state.toUpperCase()}` : "ADD IN PROFILE"}</div>
        </div>
        <div className="etile lite">
          <div className="el">OPEN ROLES</div>
          <div className="ev">{a.open_roles ?? "n/a"}</div>
          <div className="es">{a.current_tool ? `ON ${a.current_tool.toUpperCase().slice(0, 32)}` : "TOOL NOT KNOWN"}</div>
        </div>
        <div className="etile lite">
          <div className="el">SUGGESTED PLAN</div>
          <div className="ev">{plan ? PLAN_LABELS[plan] : "n/a"}</div>
          <div className="es">{planPrice ? `${fmtMoney(planPrice)}/MO LIST` : "NEEDS LOCATIONS"}</div>
        </div>
        <div className="etile lite">
          <div className="el">LAST TOUCH</div>
          <div className="ev">{a.last_touch_at ? fmtDate(a.last_touch_at) : "n/a"}</div>
          <div className="es">{a.last_touch_at ? `${relTime(a.last_touch_at).toUpperCase()} AGO` : "NO TOUCH LOGGED"}</div>
        </div>
        <div className="etile lite">
          <div className="el">NEXT STEP</div>
          <div className={`ev${due && due < today ? " sl-crit" : ""}`}>{due ? fmtDate(due) : "n/a"}</div>
          <div className="es">{due && due < today ? "OVERDUE" : a.next_step ? "SET BELOW" : "NONE SET"}</div>
        </div>
      </div>

      <div className="dgrid">
        <div>
          <div className="dcardx">
            <div className="ch">
              <h3>Opportunities</h3>
              <span className="mini">{opps.length ? `${openOpps.length} OPEN` : "NONE YET"}</span>
            </div>
            {opps.length === 0
              ? startForm(true)
              : [...openOpps, ...closedOpps].map((o) => (
                  <Link key={o.id} className="court-row" href={`/crm/opportunities/${o.id}`}>
                    <span className="deal">{o.name}</span>
                    <span className={`pill ${o.stage === "won" ? "good" : o.stage === "lost" ? "" : "navy"}`}>
                      {stageLabel(o.stage).toUpperCase()}
                    </span>
                    <span className="age">
                      {[o.plan_tier ? PLAN_LABELS[o.plan_tier] : null, oppMrr(o) ? `${fmtMoney(oppMrr(o))}/mo` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                ))}
            {opps.length ? (
              <details className="ac-more">
                <summary>Start another opportunity for this account</summary>
                {startForm(false)}
              </details>
            ) : null}
          </div>

          <div className="dcardx">
            <div className="ch">
              <h3>Tasks</h3>
              <span className="mini">{openTasks.length ? `${openTasks.length} OPEN` : "NOTHING OPEN"}</span>
            </div>
            {openTasks.map((t) => {
              const late = t.due_date && t.due_date < today;
              return (
                <div key={t.id} className="ac-task">
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="done" value="false" />
                    <button className="ac-check" type="submit" aria-label={`Mark done: ${t.title}`} title="Mark done" />
                  </form>
                  <span className="ac-task-t">
                    {t.priority === "high" ? <b className="sl-crit">! </b> : null}
                    {t.title}
                    {t.contact_id ? (
                      <span className="sl-sub"> · {contacts.find((c) => c.id === t.contact_id)?.name ?? "contact"}</span>
                    ) : null}
                  </span>
                  <span className={`pill ball${t.ball === "us" ? " edc" : ""}`}>{BALL_LABELS[t.ball] ?? t.ball}</span>
                  <span className={`ac-task-d${late ? " sl-crit" : ""}`}>
                    {t.due_date ? `${fmtDate(t.due_date).toUpperCase()}${late ? " · LATE" : ""}` : "NO DATE"}
                  </span>
                </div>
              );
            })}
            {openTasks.length === 0 ? (
              <div className="empty-note">No open tasks. Add the next thing to do below.</div>
            ) : null}
            <form className="dform ac-taskform" action={addAccountTask}>
              <Hidden values={back} />
              <Txt idp="tk" name="title" label="NEW TASK" max={300} required placeholder="Send the follow-up with the demo link" />
              <div className="sl-frow3">
                <DateIn idp="tk" name="due_date" label="DUE" />
                <Sel idp="tk" name="ball" label="BALL IN COURT" value="us" opts={BALL_OPTS} empty={null} />
                <Sel idp="tk" name="priority" label="PRIORITY" value="normal" opts={PRIORITY_OPTS} empty={null} />
              </div>
              {contacts.length || openOpps.length ? (
                <div className="frow2">
                  <Sel idp="tk" name="contact_id" label="CONTACT" opts={contactOpts} empty="None" />
                  <Sel
                    idp="tk"
                    name="opportunity_id"
                    label="OPPORTUNITY"
                    opts={openOpps.map((o) => [o.id, `${o.name} (${stageLabel(o.stage)})`] as [string, string])}
                    empty="None"
                  />
                </div>
              ) : null}
              <div>
                <button className="dbtn dbtn-line dbtn-sm" type="submit">
                  Add task
                </button>
              </div>
            </form>
            {doneTasks.length ? (
              <details className="ac-more">
                <summary>Recently done ({doneTasks.length})</summary>
                {doneTasks.map((t) => (
                  <div key={t.id} className="ac-task done">
                    <form action={toggleTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value="true" />
                      <button className="ac-check on" type="submit" aria-label={`Reopen: ${t.title}`} title="Reopen" />
                    </form>
                    <span className="ac-task-t">{t.title}</span>
                    <span className="ac-task-d">{t.completed_at ? fmtDate(t.completed_at).toUpperCase() : ""}</span>
                  </div>
                ))}
              </details>
            ) : null}
          </div>

          <div className="dcardx">
            <div className="ch">
              <h3>Key contacts</h3>
              <Link className="mini" href={`/crm/accounts/${a.id}?tab=contacts`}>
                {contacts.length ? "MANAGE" : "ADD CONTACTS"}
              </Link>
            </div>
            {contacts.length === 0 ? (
              <div className="empty-note">
                Nobody on file yet. Add the person who owns hiring and whoever can sign, from the Contacts tab.
              </div>
            ) : (
              contacts.map((c) => (
                <div key={c.id} className="kvrow">
                  <span className="k2">
                    <b className="ac-cname">{c.name}</b>
                    {c.title ? ` · ${c.title}` : ""}
                  </span>
                  <span className="v2 ac-cside">
                    <span className="pill navy">{(CONTACT_ROLE_LABELS[c.role] ?? c.role).toUpperCase()}</span>
                    {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : null}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="dcardx">
            <div className="ch">
              <h3>Recent activity</h3>
              <Link className="mini" href={`/crm/accounts/${a.id}?tab=activity`}>
                LOG OUTREACH · FULL TIMELINE
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty-note">No emails, calls or notes logged yet. Log one from the Activity tab.</div>
            ) : (
              <div className="tl">
                {recent.map((ev) => (
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
          </div>

          {a.hiring_signal || a.growth_signal ? (
            <div className="dcardx">
              <div className="ch">
                <h3>Signals</h3>
                <span className="mini">FROM RESEARCH</span>
              </div>
              {a.hiring_signal ? <KV k="Hiring" v={<span className="ac-pre">{a.hiring_signal}</span>} /> : null}
              {a.growth_signal ? <KV k="Growth" v={<span className="ac-pre">{a.growth_signal}</span>} /> : null}
            </div>
          ) : null}

          {a.notes ? (
            <div className="dcardx">
              <div className="ch">
                <h3>Notes</h3>
              </div>
              <div className="prose-note">{a.notes}</div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="dcardx">
            <div className="ch">
              <h3>Relationship</h3>
              <span className="mini">STATUS, FIT, NEXT STEP</span>
            </div>
            <form className="dform" action={updateAccount}>
              <Hidden values={{ ...back, section: "relationship" }} />
              <div className="frow2">
                <Sel idp="rl" name="status" label="STATUS" value={a.status} opts={ACCOUNT_STATUS_LABELS} empty={null} />
                <Sel idp="rl" name="fit_tier" label="FIT TIER" value={a.fit_tier} opts={FIT_LABELS} />
              </div>
              <div className="frow2">
                <Sel idp="rl" name="warmth" label="WARMTH" value={a.warmth ? String(a.warmth) : null} opts={WARMTH_LABELS} />
                <Sel idp="rl" name="source" label="SOURCE" value={a.source} opts={SOURCE_LABELS} empty={null} />
              </div>
              <Txt idp="rl" name="next_step" label="NEXT STEP" value={a.next_step} max={300} placeholder="Call the VP of People" />
              <DateIn idp="rl" name="next_step_due" label="NEXT STEP DUE" value={a.next_step_due} />
              <Area idp="rl" name="notes" label="NOTES" value={a.notes} rows={4} max={20000} />
              <div>
                <button className="dbtn dbtn-green" type="submit">
                  Save relationship
                </button>
              </div>
            </form>
          </div>

          <div className="dcardx">
            <div className="ch">
              <h3>Personalized demo</h3>
              <span className="mini">{demo ? `OPENED ${demo.visits}×` : "NOT OPENED YET"}</span>
            </div>
            <div className="ac-pad">
              <CopyLink label="DEMO LINK FOR THIS GROUP" value={demoLink} />
              <p className="ac-hint">
                {demo
                  ? `Opened ${demo.visits === 1 ? "once" : `${demo.visits} times`}, last seen ${lastSeen(demo.last_seen_at)}.`
                  : "Opens of this link show up here and on the timeline, and ring the bell."}{" "}
                The demo greets them with their group name.
              </p>
            </div>
          </div>

          <div className="dcardx">
            <div className="ch">
              <h3>Profile</h3>
              <span className="mini">SIZE, TOOLS, PEOPLE</span>
            </div>
            <form className="dform" action={updateAccount}>
              <Hidden values={{ ...back, section: "profile" }} />
              <Txt idp="pf" name="name" label="GROUP NAME" value={a.name} max={160} required />
              <div className="frow2">
                <Txt idp="pf" name="website" label="WEBSITE" value={a.website} max={300} placeholder="brightdirectiondental.com" />
                <Txt idp="pf" name="hq_state" label="HQ STATE" value={a.hq_state} max={40} />
              </div>
              <Txt idp="pf" name="states" label="STATES THEY OPERATE IN" value={(a.states ?? []).join(", ")} max={600} placeholder="TX, OK, LA" />
              <div className="frow2">
                <NumIn idp="pf" name="locations" label="LOCATIONS" value={a.locations} min={0} max={5000} />
                <NumIn idp="pf" name="open_roles" label="OPEN ROLES" value={a.open_roles} min={0} max={100000} />
              </div>
              <Txt idp="pf" name="locations_note" label="LOCATIONS NOTE" value={a.locations_note} max={300} placeholder="Counted from the find-a-location page" />
              <div className="frow2">
                <Txt idp="pf" name="current_tool" label="CURRENT HIRING TOOL" value={a.current_tool} max={200} />
                <Txt idp="pf" name="hiring_owner_title" label="WHO OWNS HIRING" value={a.hiring_owner_title} max={200} />
              </div>
              <Area idp="pf" name="hiring_signal" label="HIRING SIGNAL" value={a.hiring_signal} rows={2} max={2000} />
              <Area idp="pf" name="growth_signal" label="GROWTH SIGNAL" value={a.growth_signal} rows={2} max={2000} />
              <div>
                <button className="dbtn dbtn-green" type="submit">
                  Save profile
                </button>
              </div>
            </form>
          </div>

          {a.sources?.length || a.researched_on ? (
            <div className="dcardx">
              <div className="ch">
                <h3>Research sources</h3>
                <span className="mini">{a.researched_on ? `SEEN ${fmtDate(a.researched_on).toUpperCase()}` : "UNDATED"}</span>
              </div>
              <ul className="ac-sources">
                {(a.sources ?? []).map((u) => (
                  <li key={u}>
                    <a href={hrefOf(u)} target="_blank" rel="noreferrer">
                      {u.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="dcardx">
            <div className="ch">
              <h3>Owner</h3>
              <span className="mini">
                {a.owner_id === me ? "YOU" : a.owner_id ? "ANOTHER ADMIN" : "UNASSIGNED"}
              </span>
            </div>
            <form className="ac-pad ac-row" action={setAccountOwner}>
              <Hidden values={back} />
              {a.owner_id !== me ? (
                <button className="dbtn dbtn-line dbtn-sm" type="submit" name="owner" value="me">
                  Assign to me
                </button>
              ) : null}
              {a.owner_id ? (
                <button className="dbtn dbtn-line dbtn-sm" type="submit" name="owner" value="none">
                  Unassign
                </button>
              ) : null}
            </form>
          </div>

          {!archived ? (
            <details className="ac-archive">
              <summary>Archive this account</summary>
              <p>
                Archiving takes {a.name} off the list, the pipeline and Today. Its contacts, opportunities and timeline
                stay on file, and you can restore it from Archived.
              </p>
              <form action={archiveAccount} className="ac-row">
                <Hidden values={{ account_id: a.id }} />
                <input name="confirm" placeholder='Type "archive"' aria-label='Type "archive" to confirm' required />
                <button className="dbtn dbtn-sm ac-archive-go" type="submit">
                  Archive
                </button>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}
