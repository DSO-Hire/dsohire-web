"use client";

/* Email templates (2026-10-19): the outreach kit's emails and LinkedIn
   note, editable here and used by "Compose from a template" on every
   account profile. Keys are fixed once created (the cold sequence and the
   timeline's "templates logged" list read them); archive hides a template
   from the picker without losing its history. */

import { useRef, useState, useTransition } from "react";
import { MERGE_FIELDS, type TemplateRec } from "../accounts/[id]/compose-lib";
import { saveTemplate, setTemplateArchived } from "./actions";
import "./templates.css";

type Status = { ok: boolean; text: string } | null;

function TemplateForm({ t }: { t: TemplateRec | null }) {
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<"email" | "linkedin">(t?.channel ?? "email");
  const formRef = useRef<HTMLFormElement>(null);
  const idp = t ? `tpl-${t.id.slice(0, 8)}` : "tpl-new";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (t) fd.set("id", t.id);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await saveTemplate(fd);
        if (res.error) setStatus({ ok: false, text: res.error });
        else {
          setStatus({ ok: true, text: t ? "Saved" : "Template added" });
          if (!t) {
            formRef.current?.reset();
            setChannel("email");
          }
        }
      } catch {
        setStatus({ ok: false, text: "Could not reach the server. Try again." });
      }
    });
  }

  function archive(next: boolean) {
    if (!t) return;
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await setTemplateArchived(t.id, next);
        setStatus(res.error ? { ok: false, text: res.error } : { ok: true, text: next ? "Archived" : "Restored" });
      } catch {
        setStatus({ ok: false, text: "Could not reach the server. Try again." });
      }
    });
  }

  return (
    <form ref={formRef} className="dform tpl-form" onSubmit={onSubmit}>
      <div className="frow2">
        <div>
          <label htmlFor={`${idp}-name`}>NAME</label>
          <input id={`${idp}-name`} name="name" defaultValue={t?.name ?? ""} maxLength={80} required />
        </div>
        {t ? (
          <div>
            <label htmlFor={`${idp}-sort`}>ORDER</label>
            <input id={`${idp}-sort`} name="sort" type="number" min={0} max={9999} step={1} defaultValue={t.sort} />
          </div>
        ) : (
          <div className="tpl-2">
            <div>
              <label htmlFor={`${idp}-channel`}>CHANNEL</label>
              <select
                id={`${idp}-channel`}
                name="channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value === "linkedin" ? "linkedin" : "email")}
              >
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn note</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${idp}-sort`}>ORDER</label>
              <input id={`${idp}-sort`} name="sort" type="number" min={0} max={9999} step={1} defaultValue={100} />
            </div>
          </div>
        )}
      </div>
      {channel === "email" ? (
        <div>
          <label htmlFor={`${idp}-subject`}>SUBJECT</label>
          <input id={`${idp}-subject`} name="subject" defaultValue={t?.subject ?? ""} maxLength={200} required />
        </div>
      ) : null}
      <div>
        <label htmlFor={`${idp}-body`}>{channel === "linkedin" ? "NOTE" : "BODY"}</label>
        <textarea
          id={`${idp}-body`}
          name="body"
          defaultValue={t?.body ?? ""}
          rows={channel === "linkedin" ? 4 : 9}
          maxLength={5000}
          required
        />
        <span className="tpl-help">
          {channel === "linkedin"
            ? "LinkedIn connection notes stop at 300 characters once merged. No signature is added."
            : "Your signature is added below the body. Templates whose key starts with cold_ also get the opt-out line and mailing address."}
        </span>
      </div>
      <div className="frow2">
        <div>
          <label htmlFor={`${idp}-next`}>NEXT STEP AFTER SENDING</label>
          <input
            id={`${idp}-next`}
            name="next_step"
            defaultValue={t?.next_step ?? ""}
            maxLength={200}
            placeholder="Optional, e.g. Follow-up 1"
          />
        </div>
        <div>
          <label htmlFor={`${idp}-days`}>FOLLOW UP AFTER (DAYS)</label>
          <input
            id={`${idp}-days`}
            name="next_step_days"
            type="number"
            min={1}
            max={60}
            step={1}
            defaultValue={t?.next_step_days ?? ""}
            placeholder="Blank for none"
          />
        </div>
      </div>
      <div className="tpl-foot">
        <button type="submit" className="dbtn dbtn-green dbtn-sm" disabled={pending}>
          {pending ? "Saving…" : t ? "Save template" : "Add template"}
        </button>
        {t ? (
          <button type="button" className="dbtn dbtn-line dbtn-sm" disabled={pending} onClick={() => archive(!t.archived_at)}>
            {t.archived_at ? "Restore" : "Archive"}
          </button>
        ) : null}
        <span aria-live="polite">{status ? <span className={status.ok ? "ok" : "err"}>{status.text}</span> : null}</span>
      </div>
    </form>
  );
}

function Row({ t }: { t: TemplateRec }) {
  return (
    <details className={`tpl-row${t.archived_at ? " tpl-arch" : ""}`}>
      <summary>
        <span className="tpl-name">{t.name}</span>
        <span className={`pill ${t.channel === "linkedin" ? "navy" : "good"}`}>{t.channel === "linkedin" ? "LINKEDIN" : "EMAIL"}</span>
        <span className="tpl-meta">
          {t.key}
          {t.next_step_days ? ` · FOLLOW UP IN ${t.next_step_days}D` : ""}
        </span>
      </summary>
      <TemplateForm t={t} />
    </details>
  );
}

export default function TemplatesCard({ templates, available }: { templates: TemplateRec[]; available: boolean }) {
  const active = templates.filter((t) => !t.archived_at);
  const archived = templates.filter((t) => t.archived_at);
  const [adding, setAdding] = useState(false);

  return (
    <section className="dcardx ws-set tpl-card" id="templates" aria-labelledby="ws-tpl-h">
      <div className="ch">
        <h3 id="ws-tpl-h">Email templates</h3>
        <span className="mini">{available ? `${active.length} ACTIVE · USED BY COMPOSE` : "NOT AVAILABLE"}</span>
      </div>
      {!available ? (
        <div className="empty-note">The templates could not be loaded. Reload the page.</div>
      ) : (
        <>
          <div className="tpl-legend">
            <span className="tpl-legend-l">MERGE FIELDS</span>
            <dl>
              {MERGE_FIELDS.map(([f, d]) => (
                <div key={f}>
                  <dt>
                    <code>{f}</code>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </div>
          {active.length === 0 ? <div className="empty-note">No active templates. Add one below.</div> : null}
          {active.map((t) => (
            <Row key={t.id} t={t} />
          ))}
          {archived.length ? (
            <details className="tpl-archived">
              <summary>Archived ({archived.length})</summary>
              {archived.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </details>
          ) : null}
          <div className="tpl-add">
            {adding ? (
              <>
                <div className="tpl-add-h">
                  <b>New template</b>
                  <button type="button" className="dbtn dbtn-line dbtn-sm" onClick={() => setAdding(false)}>
                    Close
                  </button>
                </div>
                <TemplateForm t={null} />
              </>
            ) : (
              <button type="button" className="dbtn dbtn-line dbtn-sm" onClick={() => setAdding(true)}>
                Add a template
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
