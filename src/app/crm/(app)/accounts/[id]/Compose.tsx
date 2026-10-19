"use client";

/* Compose email from a template (2026-10-19). Pick a template and a
   contact; the subject and body fill in from the account's merge fields
   and stay editable. The founder sends from his own mail app (mailto: or
   copy and paste), then clicks "Log as sent" to record it on the timeline.
   The server never sends email. */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CONTACT_ROLE_LABELS, fmtDate } from "../../format";
import { logTemplateSend } from "./compose-actions";
import {
  COLD_SEQUENCE,
  LINKEDIN_LIMIT,
  MAILTO_SOFT_LIMIT,
  SIGNAL_MARK,
  draftFor,
  firstNameFrom,
  isCold,
  mailtoHref,
  nextColdKey,
  type MergeVars,
  type TemplateRec,
} from "./compose-lib";
import "./compose.css";

export type ComposeContact = {
  id: string;
  name: string;
  title: string | null;
  role: string;
  email: string | null;
  linkedin_url: string | null;
};

export type SentRec = { id: string; key: string; name: string; at: string; contact: string | null };

function defaultContact(contacts: ComposeContact[]): string {
  const withEmail = contacts.filter((c) => c.email);
  return (
    withEmail.find((c) => c.role === "decision_maker")?.id ??
    withEmail.find((c) => c.role === "champion")?.id ??
    withEmail[0]?.id ??
    contacts.find((c) => c.role === "decision_maker")?.id ??
    contacts.find((c) => c.role === "champion")?.id ??
    contacts[0]?.id ??
    ""
  );
}

function CopyBtn({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="dbtn dbtn-line dbtn-sm"
      disabled={disabled || !value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: select the field and copy by hand */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export default function Compose({
  accountId,
  group,
  templates,
  contacts,
  sent,
  vars,
  hasSignal,
  signature,
  mailingAddress,
  footerAvailable,
  templatesAvailable,
  initiallyOpen,
}: {
  accountId: string;
  group: string;
  templates: TemplateRec[];
  contacts: ComposeContact[];
  sent: SentRec[];
  vars: Omit<MergeVars, "first_name">;
  hasSignal: boolean;
  signature: string;
  mailingAddress: string;
  footerAvailable: boolean;
  templatesAvailable: boolean;
  initiallyOpen: boolean;
}) {
  const sentKeys = useMemo(() => new Set(sent.map((s) => s.key)), [sent]);
  const initialKey = useMemo(() => {
    const next = nextColdKey(sentKeys);
    if (next && templates.some((t) => t.key === next)) return next;
    return templates[0]?.key ?? "";
  }, [sentKeys, templates]);

  const [open, setOpen] = useState(initiallyOpen);
  const [tplKey, setTplKey] = useState(initialKey);
  const [contactId, setContactId] = useState(() => defaultContact(contacts));
  const footer = { signature, mailingAddress };

  const build = (key: string, cid: string) => {
    const tpl = templates.find((t) => t.key === key);
    if (!tpl) return { subject: "", body: "" };
    const c = contacts.find((x) => x.id === cid);
    return draftFor(tpl, { ...vars, first_name: firstNameFrom(c?.name) }, footer);
  };
  const [draft, setDraft] = useState(() => build(initialKey, contactId));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const tpl = templates.find((t) => t.key === tplKey) ?? null;
  const contact = contacts.find((c) => c.id === contactId) ?? null;
  const linkedin = tpl?.channel === "linkedin";
  const cold = tpl ? isCold(tpl.key) : false;
  const placeholderLeft = draft.body.includes(SIGNAL_MARK) || draft.subject.includes(SIGNAL_MARK);
  const tooLongForMailto = draft.body.length > MAILTO_SOFT_LIMIT;
  const emailTpls = templates.filter((t) => t.channel !== "linkedin");
  const liTpls = templates.filter((t) => t.channel === "linkedin");
  const nextCold = nextColdKey(sentKeys);
  const coldDone = COLD_SEQUENCE.every((k) => sentKeys.has(k));

  function pick(key: string, cid: string) {
    setTplKey(key);
    setContactId(cid);
    setDraft(build(key, cid));
    setResult(null);
  }

  function logSent() {
    if (!tpl) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await logTemplateSend({
          accountId,
          templateKey: tpl.key,
          contactId: contactId || null,
          subject: linkedin ? "" : draft.subject,
          body: draft.body,
        });
        if (res.error) setResult({ ok: false, text: res.error });
        else
          setResult({
            ok: true,
            text: res.nextStep
              ? `Logged. Next step set: ${res.nextStep}, due ${fmtDate(res.nextStepDue)}.`
              : "Logged on the timeline.",
          });
      } catch {
        setResult({ ok: false, text: "Could not reach the server. Check your connection and try again." });
      }
    });
  }

  return (
    <section className="dcardx cmp" id="compose" aria-labelledby="cmp-h">
      <div className="ch">
        <h3 id="cmp-h">Compose from a template</h3>
        <button
          type="button"
          className={`dbtn dbtn-sm ${open ? "dbtn-line" : "dbtn-green"}`}
          aria-expanded={open}
          aria-controls="cmp-body"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Compose email"}
        </button>
      </div>

      {open ? (
        <div id="cmp-body" className="cmp-body">
          {!templatesAvailable ? (
            <div className="empty-note">The templates could not be loaded. Reload the page.</div>
          ) : templates.length === 0 ? (
            <div className="empty-note">
              No active templates. Add or restore one in{" "}
              <Link className="ws-link" href="/crm/settings#templates">
                Settings
              </Link>
              .
            </div>
          ) : (
            <>
              <div className="cmp-row">
                <label className="cmp-field">
                  <span>TEMPLATE</span>
                  <select value={tplKey} onChange={(e) => pick(e.target.value, contactId)}>
                    {emailTpls.length ? (
                      <optgroup label="Email">
                        {emailTpls.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.name}
                            {sentKeys.has(t.key) ? " (sent)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {liTpls.length ? (
                      <optgroup label="LinkedIn">
                        {liTpls.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.name}
                            {sentKeys.has(t.key) ? " (sent)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <label className="cmp-field">
                  <span>TO</span>
                  <select value={contactId} onChange={(e) => pick(tplKey, e.target.value)} disabled={!contacts.length}>
                    {contacts.length === 0 ? <option value="">No contacts yet</option> : null}
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.role in CONTACT_ROLE_LABELS && c.role !== "other" ? `, ${CONTACT_ROLE_LABELS[c.role]}` : ""}
                        {linkedin ? (c.linkedin_url ? "" : " (no LinkedIn)") : c.email ? ` <${c.email}>` : " (no email)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="cmp-warns" aria-live="polite">
                {!hasSignal ? (
                  <p className="cmp-warn">
                    No hiring or growth signal on file, so the draft has a bracketed placeholder. The outreach rule: no
                    specific, true reason to write to {group}, don&apos;t send yet. Add a signal in the profile or
                    replace the placeholder.
                  </p>
                ) : null}
                {hasSignal && placeholderLeft ? (
                  <p className="cmp-warn">The draft still has a bracketed placeholder. Replace it before sending.</p>
                ) : null}
                {!linkedin && cold && footerAvailable && !mailingAddress.trim() ? (
                  <p className="cmp-warn">
                    Add your mailing address in{" "}
                    <Link className="ws-link" href="/crm/settings#signature">
                      Settings
                    </Link>
                    ; cold email needs one.
                  </p>
                ) : null}
                {contacts.length === 0 ? (
                  <p className="cmp-note">
                    No contacts on this account, so the greeting uses &quot;there&quot;. Add one on the{" "}
                    <Link className="ws-link" href={`/crm/accounts/${accountId}?tab=contacts`}>
                      Contacts
                    </Link>{" "}
                    tab.
                  </p>
                ) : !linkedin && contact && !contact.email ? (
                  <p className="cmp-note">{contact.name} has no email on file. The mail app will open without a recipient.</p>
                ) : null}
              </div>

              {!linkedin ? (
                <label className="cmp-field">
                  <span>SUBJECT</span>
                  <input
                    value={draft.subject}
                    maxLength={300}
                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                  />
                </label>
              ) : null}
              <label className="cmp-field">
                <span className="cmp-lblrow">
                  {linkedin ? "CONNECTION NOTE" : "BODY"}
                  {linkedin ? (
                    <b className={draft.body.length > LINKEDIN_LIMIT ? "cmp-over" : undefined}>
                      {draft.body.length} / {LINKEDIN_LIMIT}
                    </b>
                  ) : (
                    <b className={tooLongForMailto ? "cmp-over" : undefined}>{draft.body.length} characters</b>
                  )}
                </span>
                <textarea
                  value={draft.body}
                  rows={linkedin ? 5 : 14}
                  maxLength={20000}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </label>
              {linkedin && draft.body.length > LINKEDIN_LIMIT ? (
                <p className="cmp-warn">LinkedIn connection notes stop at {LINKEDIN_LIMIT} characters. Trim it before pasting.</p>
              ) : null}
              {!linkedin && tooLongForMailto ? (
                <p className="cmp-warn">
                  Over {MAILTO_SOFT_LIMIT.toLocaleString("en-US")} characters: some mail apps cut long bodies opened this
                  way. Use Copy body instead and paste it in.
                </p>
              ) : null}

              <div className="cmp-actions">
                {linkedin ? (
                  <>
                    <CopyBtn label="Copy note" value={draft.body} />
                    {contact?.linkedin_url ? (
                      <a className="dbtn dbtn-line dbtn-sm" href={contact.linkedin_url} target="_blank" rel="noreferrer">
                        Open {contact.name.split(/\s+/)[0]}&apos;s LinkedIn ⇗
                      </a>
                    ) : (
                      <span className="cmp-note">No LinkedIn profile on file for this contact.</span>
                    )}
                  </>
                ) : (
                  <>
                    <a className="dbtn dbtn-green dbtn-sm" href={mailtoHref(contact?.email ?? null, draft.subject, draft.body)}>
                      Open in email app
                    </a>
                    <CopyBtn label="Copy subject" value={draft.subject} />
                    <CopyBtn label="Copy body" value={draft.body} />
                  </>
                )}
                <span className="cmp-spacer" />
                <button
                  type="button"
                  className="dbtn dbtn-line dbtn-sm"
                  onClick={logSent}
                  disabled={pending || !draft.body.trim()}
                >
                  {pending ? "Logging…" : "Log as sent"}
                </button>
              </div>
              <p className="cmp-note">
                Nothing is sent from here. Send it from your own mailbox, then log it: that records the touch
                {tpl?.next_step_days ? `, sets the next step (${tpl.next_step ?? "follow up"}, in ${tpl.next_step_days} days)` : ""}
                , and moves a Target to Contacted. Switching template or recipient resets the text.
              </p>
              {result ? (
                <p className={result.ok ? "cmp-ok" : "cmp-err"} role="status">
                  {result.text}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="cmp-sent">
        <span className="cmp-sent-l">TEMPLATES LOGGED</span>
        {sent.length === 0 ? (
          <span className="cmp-note">None yet. The cold sequence starts with {templates.find((t) => t.key === COLD_SEQUENCE[0])?.name ?? "the first touch"}.</span>
        ) : (
          <>
            <ul>
              {sent.slice(0, 12).map((s) => (
                <li key={s.id}>
                  <b>{s.name}</b> · {fmtDate(s.at)}
                  {s.contact ? ` · ${s.contact}` : ""}
                </li>
              ))}
            </ul>
            <span className="cmp-note">
              {coldDone
                ? "The cold sequence is done for this account."
                : nextCold
                  ? `Next in the cold sequence: ${templates.find((t) => t.key === nextCold)?.name ?? nextCold}.`
                  : null}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
