import { DNC_REASONS, fmtDate } from "../../format";
import { clearAccountDnc, clearContactDnc, setAccountDnc, setContactDnc } from "./dnc-actions";

/* Do-not-contact controls (2026-10-19): the account banner when flagged,
   and the small "mark" forms for an account or one contact. Server-safe. */

function ReasonFields({ idp }: { idp: string }) {
  return (
    <>
      <label htmlFor={`${idp}-reason`}>WHY</label>
      <select id={`${idp}-reason`} name="reason" defaultValue="replied_no" required>
        {Object.entries(DNC_REASONS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label htmlFor={`${idp}-note`}>NOTE (OPTIONAL)</label>
      <input id={`${idp}-note`} name="note" maxLength={500} placeholder='e.g. Replied "please remove me" on Oct 21' />
    </>
  );
}

export function AccountDncBanner({
  a,
}: {
  a: { id: string; name: string; do_not_contact_at?: string | null; do_not_contact_reason?: string | null; do_not_contact_note?: string | null };
}) {
  if (!a.do_not_contact_at) return null;
  return (
    <div className="sl-banner dnc-banner" role="status">
      <span>
        <b>Do not contact.</b> {DNC_REASONS[a.do_not_contact_reason ?? ""] ?? "Opted out"} on{" "}
        {fmtDate(a.do_not_contact_at)}
        {a.do_not_contact_note ? `: ${a.do_not_contact_note}` : ""}. Composing is off and {a.name} is out of the call sheet and
        reminders. Opt-outs are permanent unless they ask to hear from you again.
      </span>
      <details className="dnc-clear">
        <summary>They opted back in</summary>
        <form action={clearAccountDnc} className="dform">
          <input type="hidden" name="account_id" value={a.id} />
          <label htmlFor="dnc-clear-confirm">TYPE &quot;OPTED IN&quot; TO CONFIRM</label>
          <input id="dnc-clear-confirm" name="confirm" autoComplete="off" required />
          <button className="dbtn dbtn-line dbtn-sm" type="submit">
            Clear the flag
          </button>
        </form>
      </details>
    </div>
  );
}

export function AccountDncForm({ accountId }: { accountId: string }) {
  return (
    <details className="dnc-mark">
      <summary>Do not contact…</summary>
      <form action={setAccountDnc} className="dform">
        <input type="hidden" name="account_id" value={accountId} />
        <ReasonFields idp="dnc-acct" />
        <span className="sl-help">Stops all outreach to this group, clears the next step and closes open tasks.</span>
        <button className="dbtn dbtn-line dbtn-sm ac-danger" type="submit">
          Mark do not contact
        </button>
      </form>
    </details>
  );
}

export function ContactDnc({
  accountId,
  c,
}: {
  accountId: string;
  c: { id: string; name: string; do_not_contact_at?: string | null; do_not_contact_reason?: string | null; do_not_contact_note?: string | null };
}) {
  if (c.do_not_contact_at) {
    return (
      <div className="dnc-contact">
        <span>
          <span className="pill crit">DO NOT CONTACT</span> {DNC_REASONS[c.do_not_contact_reason ?? ""] ?? "Opted out"},{" "}
          {fmtDate(c.do_not_contact_at)}
          {c.do_not_contact_note ? `: ${c.do_not_contact_note}` : ""}
        </span>
        <details className="dnc-clear">
          <summary>Opted back in</summary>
          <form action={clearContactDnc} className="dform">
            <input type="hidden" name="account_id" value={accountId} />
            <input type="hidden" name="contact_id" value={c.id} />
            <input type="hidden" name="tab" value="contacts" />
            <label htmlFor={`dnc-cc-${c.id}`}>TYPE &quot;OPTED IN&quot; TO CONFIRM</label>
            <input id={`dnc-cc-${c.id}`} name="confirm" autoComplete="off" required />
            <button className="dbtn dbtn-line dbtn-sm" type="submit">
              Clear for {c.name}
            </button>
          </form>
        </details>
      </div>
    );
  }
  return (
    <details className="dnc-mark">
      <summary>Do not contact {c.name}…</summary>
      <form action={setContactDnc} className="dform">
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="contact_id" value={c.id} />
        <input type="hidden" name="tab" value="contacts" />
        <ReasonFields idp={`dnc-c-${c.id.slice(0, 8)}`} />
        <button className="dbtn dbtn-line dbtn-sm ac-danger" type="submit">
          Mark {c.name} do not contact
        </button>
      </form>
    </details>
  );
}
