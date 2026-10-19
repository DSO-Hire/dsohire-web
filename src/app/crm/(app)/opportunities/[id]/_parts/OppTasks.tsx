import Link from "next/link";
import { photoClass, photoStyle } from "../../../avatars";
import {
  addOpportunityTask,
  snoozeOpportunityTask,
  toggleOpportunityTask,
  updateOpportunityTask,
} from "../../actions";
import { countdown, daysAgo } from "../../_lib/dates";
import { BALLS, BALL_OPTION_LABELS, PRIORITY_LABELS, initials } from "../../_lib/labels";
import type { Admin, ContactRow, OppRow, TaskRow } from "./types";

const PRIO_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

export function sortOpenTasks<T extends { priority?: string | null; due_date: string | null; waiting_since: string | null }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIO_RANK[a.priority ?? "normal"] ?? 1;
    const pb = PRIO_RANK[b.priority ?? "normal"] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return (Date.parse(a.waiting_since ?? "") || 0) - (Date.parse(b.waiting_since ?? "") || 0);
  });
}

function OwnerOptions({ admins, current }: { admins: Admin[]; current: string | null }) {
  return (
    <>
      <option value="">either of us</option>
      {admins.map((a) => (
        <option key={a.id} value={a.id}>
          {a.full_name ?? a.email}
        </option>
      ))}
      {current && !admins.some((a) => a.id === current) ? <option value={current}>Another founder</option> : null}
    </>
  );
}

function TaskEdit({
  t,
  admins,
  people,
  returnTo,
}: {
  t: TaskRow;
  admins: Admin[];
  people: ContactRow[];
  returnTo: string;
}) {
  return (
    <form action={updateOpportunityTask} className="dform">
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <div>
        <label htmlFor={`te-t-${t.id}`}>TITLE</label>
        <input id={`te-t-${t.id}`} name="title" required maxLength={300} defaultValue={t.title} />
      </div>
      <div className="frow2">
        <div>
          <label htmlFor={`te-p-${t.id}`}>PRIORITY</label>
          <select id={`te-p-${t.id}`} name="priority" defaultValue={t.priority ?? "normal"}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label htmlFor={`te-d-${t.id}`}>DUE</label>
          <input id={`te-d-${t.id}`} name="due_date" type="date" defaultValue={t.due_date ?? ""} />
        </div>
      </div>
      <div className="frow2">
        <div>
          <label htmlFor={`te-b-${t.id}`}>BALL</label>
          <select id={`te-b-${t.id}`} name="ball" defaultValue={t.ball}>
            {BALLS.map((b) => (
              <option key={b} value={b}>
                {BALL_OPTION_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`te-o-${t.id}`}>OWNER</label>
          <select id={`te-o-${t.id}`} name="owner_id" defaultValue={t.owner_id ?? ""}>
            <OwnerOptions admins={admins} current={t.owner_id} />
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`te-c-${t.id}`}>PERSON</label>
        <select id={`te-c-${t.id}`} name="contact_id" defaultValue={t.contact_id ?? ""}>
          <option value="">whole account</option>
          {people.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.title ? ` · ${c.title}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`te-n-${t.id}`}>NOTES</label>
        <textarea id={`te-n-${t.id}`} name="notes" rows={2} maxLength={5000} defaultValue={t.notes ?? ""} />
      </div>
      <button className="dbtn dbtn-line dbtn-sm" type="submit">
        Save task
      </button>
    </form>
  );
}

export function SnoozeButtons({ id, returnTo }: { id: string; returnTo: string }) {
  return (
    <>
      {[1, 7].map((d) => (
        <form key={d} action={snoozeOpportunityTask} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="days" value={d} />
          <input type="hidden" name="return_to" value={returnTo} />
          <button className="iconbtn" type="submit" title={`Snooze ${d === 1 ? "a day" : "a week"}`}>
            {d === 1 ? "+1d" : "+1w"}
          </button>
        </form>
      ))}
    </>
  );
}

export default function OppTasks({
  opp,
  tasks,
  admins,
  people,
  nowMs,
}: {
  opp: OppRow;
  tasks: TaskRow[];
  admins: Admin[];
  people: ContactRow[];
  nowMs: number;
}) {
  const open = sortOpenTasks(tasks.filter((t) => !t.completed_at));
  const done = tasks
    .filter((t) => t.completed_at)
    .sort((a, b) => (Date.parse(b.completed_at ?? "") || 0) - (Date.parse(a.completed_at ?? "") || 0));
  const byId = new Map(admins.map((a) => [a.id, a]));
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const returnTo = `/crm/opportunities/${opp.id}#dx-tasks`;

  return (
    <div className="dcardx" id="dx-tasks">
      <div className="ch">
        <h3>Tasks &amp; ball-in-court</h3>
        <span className="mini">{open.length} OPEN</span>
      </div>
      <div className="dx-tasklinks">
        <Link href="/crm/tasks">All my tasks →</Link>
        <Link href={`/crm/accounts/${opp.account_id}`}>Account record →</Link>
      </div>
      {open.length === 0 ? <div className="empty-note">Nothing open. Add the next thing that needs to happen below.</div> : null}
      {open.map((t) => {
        const cd = countdown(t.due_date);
        const wait = t.ball !== "us" ? daysAgo(t.waiting_since, nowMs) : null;
        const ownerP = t.owner_id ? byId.get(t.owner_id) : undefined;
        const owner = initials(ownerP) ?? (t.owner_id ? "?" : null);
        const person = t.contact_id ? personName.get(t.contact_id) : undefined;
        return (
          <div key={t.id} className="task-row dx-taskrow">
            <form action={toggleOpportunityTask} style={{ display: "inline-flex" }}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="opportunity_id" value={opp.id} />
              <input type="hidden" name="done" value="false" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="iconbtn" title="Complete" aria-label={`Complete ${t.title}`} type="submit">
                ✓
              </button>
            </form>
            <span className="dx-tasktitle">
              {t.title}
              {t.repeat && t.repeat !== "none" ? (
                <span className="rep" title={`Repeats ${t.repeat}`}>
                  ↻
                </span>
              ) : null}
            </span>
            <span className="who2">
              {t.priority && t.priority !== "normal" ? (
                <span className={`pill ${t.priority === "high" ? "crit" : "dx-low"}`}>{PRIORITY_LABELS[t.priority]}</span>
              ) : null}
              {person ? <span className="pill navy">{person.toUpperCase()}</span> : null}
              {owner ? (
                <span className={`ownchip${photoClass(ownerP)}`} style={photoStyle(ownerP)} title={ownerP?.email ?? "Another founder"}>
                  {owner}
                </span>
              ) : null}
              <span className={`pill ball${t.ball === "us" ? " edc" : ""}`}>{String(t.ball).toUpperCase()}</span>
              {wait !== null ? <span className={`dx-wait${wait >= 5 ? " warn" : ""}`}>waiting {wait}d</span> : null}
              {t.due_date ? <span className={`pill ${cd.tone === "muted" ? "navy" : cd.tone}`}>{cd.label.toUpperCase()}</span> : null}
              <SnoozeButtons id={t.id} returnTo={returnTo} />
              <details className="dx-rowmenu">
                <summary className="iconbtn" aria-label={`Edit ${t.title}`}>
                  Edit
                </summary>
                <div className="dx-menu dx-menu-r">
                  <TaskEdit t={t} admins={admins} people={people} returnTo={returnTo} />
                </div>
              </details>
            </span>
          </div>
        );
      })}
      {done.length > 0 ? (
        <details className="dx-done">
          <summary>Done ({done.length})</summary>
          {done.map((t) => (
            <div key={t.id} className="task-row donez">
              <form action={toggleOpportunityTask} style={{ display: "inline-flex" }}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="opportunity_id" value={opp.id} />
                <input type="hidden" name="done" value="true" />
                <input type="hidden" name="return_to" value={returnTo} />
                <button className="iconbtn" title="Reopen" aria-label={`Reopen ${t.title}`} type="submit">
                  ↺
                </button>
              </form>
              {t.title}
            </div>
          ))}
        </details>
      ) : null}

      <form action={addOpportunityTask} className="dform dx-quickadd">
        <input type="hidden" name="opportunity_id" value={opp.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <div className="dx-qarow">
          <div>
            <label htmlFor="qa-title">NEW TASK</label>
            <input id="qa-title" name="title" placeholder="What needs to happen" required maxLength={300} />
          </div>
          <div>
            <label htmlFor="qa-prio">PRIORITY</label>
            <select id="qa-prio" name="priority" defaultValue="normal">
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button className="dbtn dbtn-green dbtn-sm" type="submit">
            Add task
          </button>
        </div>
        <details className="dx-edit">
          <summary>More options</summary>
          <div className="dx-formgrid">
            <div>
              <label htmlFor="qa-ball">BALL</label>
              <select id="qa-ball" name="ball" defaultValue="us">
                {BALLS.map((b) => (
                  <option key={b} value={b}>
                    {BALL_OPTION_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qa-due">DUE</label>
              <input id="qa-due" name="due_date" type="date" />
            </div>
            <div>
              <label htmlFor="qa-owner">OWNER</label>
              <select id="qa-owner" name="owner_id" defaultValue={opp.owner_id ?? ""}>
                <OwnerOptions admins={admins} current={opp.owner_id} />
              </select>
            </div>
            <div>
              <label htmlFor="qa-rep">REPEAT</label>
              <select id="qa-rep" name="repeat" defaultValue="none">
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="qa-person">PERSON</label>
              <select id="qa-person" name="contact_id" defaultValue="">
                <option value="">whole account</option>
                {people.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.title ? ` · ${c.title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="qa-notes">NOTES</label>
            <textarea id="qa-notes" name="notes" rows={2} maxLength={5000} />
          </div>
        </details>
      </form>
    </div>
  );
}
