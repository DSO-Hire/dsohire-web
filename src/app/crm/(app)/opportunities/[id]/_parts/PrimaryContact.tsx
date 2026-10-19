import Link from "next/link";
import { CONTACT_ROLE_LABELS } from "../../../format";
import { setPrimaryContact } from "../../actions";
import type { ContactRow, OppRow } from "./types";

/* The person this sale runs through, picked from the account's contacts.
   Without an explicit pick it falls back to the account's decision maker. */
export default function PrimaryContact({
  opp,
  contacts,
}: {
  opp: OppRow;
  contacts: ContactRow[];
}) {
  const set = contacts.find((c) => c.id === opp.primary_contact_id);
  const fallback = set ? null : (contacts.find((c) => c.role === "decision_maker") ?? contacts[0] ?? null);
  const c = set ?? fallback;
  return (
    <div className="dcardx" id="dx-contact">
      <div className="ch">
        <h3>Primary contact</h3>
        <span className="mini">{set ? "SET ON OPPORTUNITY" : c ? "FROM THE ACCOUNT" : "NONE YET"}</span>
      </div>
      {c ? (
        <>
          <div className="kvrow">
            <span className="k2">Name</span>
            <span className="v2">
              <b>{c.name}</b>
              {c.title ? ` · ${c.title}` : ""}
            </span>
          </div>
          <div className="kvrow">
            <span className="k2">Role</span>
            <span className="v2">{CONTACT_ROLE_LABELS[c.role] ?? c.role}</span>
          </div>
          <div className="kvrow">
            <span className="k2">Email</span>
            <span className="v2">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "n/a"}</span>
          </div>
          <div className="kvrow">
            <span className="k2">Phone</span>
            <span className="v2">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "n/a"}</span>
          </div>
          {c.linkedin_url && /^https?:\/\//i.test(c.linkedin_url) ? (
            <div className="kvrow">
              <span className="k2">LinkedIn</span>
              <span className="v2">
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">
                  Profile ⇗
                </a>
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-note">
          No contacts at this account yet. <Link href={`/crm/accounts/${opp.account_id}`}>Add one on the account</Link>.
        </div>
      )}
      {contacts.length > 0 ? (
        <form action={setPrimaryContact} className="dform">
          <input type="hidden" name="id" value={opp.id} />
          <div>
            <label htmlFor="dx-pc">PRIMARY CONTACT</label>
            <select id="dx-pc" name="primary_contact_id" defaultValue={opp.primary_contact_id ?? ""}>
              <option value="">not set (use the decision maker)</option>
              {contacts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` · ${p.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button className="dbtn dbtn-line dbtn-sm" type="submit">
              Save contact
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
