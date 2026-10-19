"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PLAN_LABELS } from "../../../format";
import { createQuote, deleteQuote, setQuoteStatus } from "../../quote-actions";

type Prices = Record<string, { monthly: number; annual: number }>;

/* New proposal: plan and billing drive the price. Every plan quotes its
   list price; only Enterprise takes a custom monthly figure (value-led
   pricing, no discounts). The server enforces the same rule. */
export function NewProposalForm({
  oppId,
  defaults,
  prices,
  contacts,
  minDate,
}: {
  oppId: string;
  defaults: { plan: string; billing: string; locations: number | null; contactId: string; validUntil: string };
  prices: Prices;
  contacts: { id: string; label: string }[];
  minDate: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(defaults.plan);
  const [billing, setBilling] = useState(defaults.billing);
  const list = prices[plan]?.[billing === "annual" ? "annual" : "monthly"] ?? 0;
  const [custom, setCustom] = useState<string>(String(list));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const enterprise = plan === "enterprise";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErr(null);
    start(async () => {
      const res = await createQuote({
        opportunity_id: oppId,
        plan_tier: plan,
        billing,
        monthly_price: enterprise ? custom : null,
        locations: String(fd.get("locations") ?? ""),
        contact_id: String(fd.get("contact_id") ?? ""),
        valid_until: String(fd.get("valid_until") ?? ""),
        intro: String(fd.get("intro") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      });
      if (res.error) {
        setErr(res.error);
        return;
      }
      form.reset();
      const d = form.closest("details");
      if (d) d.open = false;
      router.refresh();
    });
  }

  return (
    <details className="qp-new">
      <summary className="dbtn dbtn-line dbtn-sm">+ New proposal</summary>
      <form className="dform" onSubmit={onSubmit}>
        <div className="frow2">
          <div>
            <label htmlFor="qp-plan">PLAN</label>
            <select
              id="qp-plan"
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value);
                setCustom(String(prices[e.target.value]?.[billing === "annual" ? "annual" : "monthly"] ?? ""));
              }}
            >
              {Object.entries(PLAN_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qp-billing">BILLING</label>
            <select
              id="qp-billing"
              value={billing}
              onChange={(e) => {
                setBilling(e.target.value);
                setCustom(String(prices[plan]?.[e.target.value === "annual" ? "annual" : "monthly"] ?? ""));
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual (billed yearly)</option>
            </select>
          </div>
        </div>
        <div className="frow2">
          <div>
            <label htmlFor="qp-price">PRICE PER MONTH ($)</label>
            {enterprise ? (
              <input
                id="qp-price"
                type="number"
                min={1}
                step="0.01"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                required
              />
            ) : (
              <input id="qp-price" value={`${list.toLocaleString("en-US")} (list price)`} readOnly aria-readonly="true" />
            )}
          </div>
          <div>
            <label htmlFor="qp-loc">LOCATIONS</label>
            <input
              id="qp-loc"
              name="locations"
              type="number"
              min={1}
              max={5000}
              step={1}
              defaultValue={defaults.locations ?? ""}
            />
          </div>
        </div>
        <div className="frow2">
          <div>
            <label htmlFor="qp-contact">PREPARED FOR</label>
            <select id="qp-contact" name="contact_id" defaultValue={defaults.contactId}>
              <option value="">no contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qp-valid">VALID UNTIL</label>
            <input id="qp-valid" name="valid_until" type="date" min={minDate} defaultValue={defaults.validUntil} required />
          </div>
        </div>
        <div>
          <label htmlFor="qp-intro">INTRO PARAGRAPH (OPTIONAL, PRINTED)</label>
          <textarea id="qp-intro" name="intro" rows={3} maxLength={2000} />
        </div>
        <div>
          <label htmlFor="qp-notes">NOTES (OPTIONAL, PRINTED)</label>
          <textarea id="qp-notes" name="notes" rows={2} maxLength={2000} />
        </div>
        <div className="qp-formfoot">
          <button className="dbtn dbtn-green dbtn-sm" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create draft"}
          </button>
          {err ? (
            <span className="qp-err" role="alert">
              {err}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

const NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "sent", label: "Mark sent" }],
  sent: [
    { to: "accepted", label: "Accepted" },
    { to: "declined", label: "Declined" },
    { to: "expired", label: "Expired" },
  ],
  accepted: [{ to: "sent", label: "Back to sent" }],
  declined: [{ to: "sent", label: "Back to sent" }],
  expired: [{ to: "sent", label: "Re-sent" }],
};

/* Per-row: open the printable page, move the status, delete a draft. */
export function QuoteRowActions({ id, oppId, status }: { id: string; oppId: string; status: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error: string | null }>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      router.refresh();
    });
  }

  return (
    <span className="qp-acts">
      <Link className="iconbtn" href={`/crm/opportunities/${oppId}/proposal/${id}`}>
        Open
      </Link>
      {(NEXT[status] ?? []).map((n) => (
        <button key={n.to} type="button" className="iconbtn" disabled={pending} onClick={() => run(() => setQuoteStatus(id, n.to))}>
          {n.label}
        </button>
      ))}
      {status === "draft" ? (
        <button
          type="button"
          className="iconbtn"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Delete this draft proposal?")) run(() => deleteQuote(id));
          }}
          aria-label="Delete draft"
        >
          ×
        </button>
      ) : null}
      {err ? (
        <span className="qp-err" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}
