import { CONTACT_ROLE_LABELS, fmtDate } from "../../format";
import { addContact, deleteContact, updateContact } from "../actions";
import { hrefOf } from "../lib";
import { Area, Hidden, Sel, Txt } from "../ui";
import type { ContactRec, SectionProps } from "./types";

/* Role order on the page: who signs first, then who champions, then the rest. */
const ROLE_ORDER = ["decision_maker", "champion", "recruiter", "connector", "user", "other"];

function ContactFields({ c, idp }: { c?: ContactRec; idp: string }) {
  return (
    <>
      <div className="frow2">
        <Txt idp={idp} name="name" label="NAME" value={c?.name} max={160} required placeholder="Jordan Lee" />
        <Txt idp={idp} name="title" label="TITLE" value={c?.title} max={160} placeholder="Director of Talent" />
      </div>
      <div className="frow2">
        <Sel idp={idp} name="role" label="ROLE IN THE DEAL" value={c?.role ?? "other"} opts={CONTACT_ROLE_LABELS} empty={null} />
        <Txt idp={idp} name="email" label="EMAIL" type="email" value={c?.email} max={320} />
      </div>
      <div className="frow2">
        <Txt idp={idp} name="phone" label="PHONE" value={c?.phone} max={40} />
        <Txt idp={idp} name="linkedin_url" label="LINKEDIN URL" value={c?.linkedin_url} max={300} placeholder="linkedin.com/in/..." />
      </div>
      <Area idp={idp} name="notes" label="NOTES" value={c?.notes} rows={2} max={5000} />
    </>
  );
}

export default function Contacts({ a, contacts }: SectionProps) {
  const sorted = [...contacts].sort(
    (x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role) || x.name.localeCompare(y.name),
  );
  const hasDecider = contacts.some((c) => c.role === "decision_maker");
  return (
    <div className="dgrid">
      <div>
        <div className="dcardx">
          <div className="ch">
            <h3>People at {a.name}</h3>
            <span className="mini">{contacts.length ? `${contacts.length} ON FILE` : "NONE YET"}</span>
          </div>
          {contacts.length && !hasDecider ? (
            <div className="sl-note">No decision maker on file yet. Mark whoever signs for software as Decision maker.</div>
          ) : null}
          {sorted.length === 0 ? (
            <div className="empty-note">
              Nobody on file yet. Start with whoever owns hiring (often a VP of People, a recruiting lead or the COO),
              then add whoever signs.
            </div>
          ) : (
            sorted.map((c) => (
              <div key={c.id} className="ac-contact">
                <div className="ac-contact-h">
                  <span>
                    <b className="ac-cname">{c.name}</b>
                    {c.title ? <span className="sl-sub"> · {c.title}</span> : null}
                  </span>
                  <span className={`pill ${c.role === "decision_maker" ? "good" : c.role === "champion" ? "warn" : "navy"}`}>
                    {(CONTACT_ROLE_LABELS[c.role] ?? c.role).toUpperCase()}
                  </span>
                </div>
                <div className="ac-contact-l">
                  {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : null}
                  {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : null}
                  {c.linkedin_url ? (
                    <a href={hrefOf(c.linkedin_url)} target="_blank" rel="noreferrer">
                      LinkedIn ⇗
                    </a>
                  ) : null}
                  {!c.email && !c.phone && !c.linkedin_url ? <span className="sl-dim">No way to reach them on file</span> : null}
                  <span className="sl-sub">Added {fmtDate(c.created_at)}</span>
                </div>
                {c.notes ? <div className="ac-contact-n ac-pre">{c.notes}</div> : null}
                <details className="ac-more">
                  <summary>Edit</summary>
                  <form className="dform" action={updateContact}>
                    <Hidden values={{ account_id: a.id, contact_id: c.id, tab: "contacts" }} />
                    <ContactFields c={c} idp={`ct-${c.id.slice(0, 8)}`} />
                    <div className="ac-row">
                      <button className="dbtn dbtn-green dbtn-sm" type="submit">
                        Save contact
                      </button>
                    </div>
                  </form>
                  <form action={deleteContact} className="ac-row ac-pad-x">
                    <Hidden values={{ account_id: a.id, contact_id: c.id, tab: "contacts" }} />
                    <button className="dbtn dbtn-line dbtn-sm ac-danger" type="submit">
                      Remove {c.name}
                    </button>
                    <span className="sl-help">Past timeline entries keep their text; the link to this person is cleared.</span>
                  </form>
                </details>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <div className="dcardx">
          <div className="ch">
            <h3>Add a contact</h3>
            <span className="mini">ASSIGNABLE ON TASKS AND OUTREACH</span>
          </div>
          <form className="dform" action={addContact}>
            <Hidden values={{ account_id: a.id, tab: "contacts" }} />
            <ContactFields idp="ct-new" />
            <div>
              <button className="dbtn dbtn-green" type="submit">
                Add contact
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
