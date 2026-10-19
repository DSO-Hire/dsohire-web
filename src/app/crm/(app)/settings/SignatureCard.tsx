"use client";

/* Email signature + mailing address (2026-10-19). One workspace row
   (id = true), updated in place and never deleted. The compose panel adds
   the signature to every email and the address to cold email, which needs
   one (CAN-SPAM). */

import { useState, useTransition } from "react";
import { saveSignature } from "./actions";
import "./templates.css";

export default function SignatureCard({
  signature,
  mailingAddress,
  available,
}: {
  signature: string;
  mailingAddress: string;
  available: boolean;
}) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await saveSignature(fd);
        setStatus(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved" });
      } catch {
        setStatus({ ok: false, text: "Could not reach the server. Try again." });
      }
    });
  }

  return (
    <section className="dcardx ws-set" id="signature" aria-labelledby="ws-sig-h">
      <div className="ch">
        <h3 id="ws-sig-h">Email signature</h3>
        <span className="mini">ADDED BY COMPOSE</span>
      </div>
      {!available ? (
        <div className="empty-note">The signature could not be loaded. Reload the page.</div>
      ) : (
        <form className="dform" onSubmit={onSubmit}>
          <div>
            <label htmlFor="sig-text">SIGNATURE</label>
            <textarea id="sig-text" name="email_signature" defaultValue={signature} rows={4} maxLength={1000} />
            <span className="tpl-help">Added below every composed email. LinkedIn notes go out without it.</span>
          </div>
          <div>
            <label htmlFor="sig-addr">MAILING ADDRESS</label>
            <input
              id="sig-addr"
              name="mailing_address"
              defaultValue={mailingAddress}
              maxLength={300}
              placeholder="Street, city, state ZIP (a PO box works)"
            />
            <span className="tpl-help">
              {mailingAddress.trim()
                ? "Added to cold email under the opt-out line."
                : "Missing. Cold email needs a physical mailing address; the compose panel warns until it is set."}
            </span>
          </div>
          <div className="tpl-foot">
            <button type="submit" className="dbtn dbtn-green dbtn-sm" disabled={pending}>
              {pending ? "Saving…" : "Save signature"}
            </button>
            <span aria-live="polite">{status ? <span className={status.ok ? "ok" : "err"}>{status.text}</span> : null}</span>
          </div>
        </form>
      )}
    </section>
  );
}
