import Link from "next/link";
import { PRICING_TIER_ORDER, isBillingPeriod, isPricingTier } from "@/lib/stripe/prices";
import { PLAN_LABELS, planMonthly, suggestPlan, todayIso } from "../../../format";
import { addDays, fmtShort } from "../../_lib/dates";
import { NewProposalForm, QuoteRowActions } from "./ProposalsClient";
import type { AccountRow, ContactRow, OppRow, QuoteRow } from "./types";

const STATUS_TONE: Record<string, string> = {
  draft: "navy",
  sent: "warn",
  accepted: "good",
  declined: "crit",
  expired: "crit",
};

/* Proposals for this opportunity: the list (number, plan, price, status,
   valid until) and a New proposal form prefilled from the opportunity. */
export default function Proposals({
  opp,
  account,
  contacts,
  quotes,
  loadError,
}: {
  opp: OppRow;
  account: AccountRow;
  contacts: ContactRow[];
  quotes: QuoteRow[];
  loadError?: string | null;
}) {
  const plan = isPricingTier(opp.plan_tier) ? opp.plan_tier : (suggestPlan(account?.locations) ?? "growth");
  const billing = isBillingPeriod(opp.billing) ? opp.billing : "monthly";
  const primary =
    contacts.find((c) => c.id === opp.primary_contact_id) ??
    contacts.find((c) => c.role === "decision_maker") ??
    contacts[0] ??
    null;
  const prices = Object.fromEntries(
    PRICING_TIER_ORDER.map((t) => [t, { monthly: planMonthly(t, "monthly") ?? 0, annual: planMonthly(t, "annual") ?? 0 }]),
  ) as Record<string, { monthly: number; annual: number }>;
  const today = todayIso();
  const closed = opp.stage === "lost" || opp.stage === "won";

  return (
    <div className="dcardx" id="dx-proposals">
      <div className="ch">
        <h3>Proposals</h3>
        <span className="mini">
          {quotes.length ? `${quotes.length} ON FILE` : "NONE YET"} · LIST PRICE, NO DISCOUNTS
        </span>
      </div>
      {loadError ? <div className="empty-note">Proposals did not load: {loadError}</div> : null}
      {quotes.length > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Plan</th>
              <th className="r">Price</th>
              <th>Status</th>
              <th>Valid until</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const lapsed = q.status === "sent" && q.valid_until < today;
              return (
                <tr key={q.id}>
                  <td>
                    <Link href={`/crm/opportunities/${opp.id}/proposal/${q.id}`}>
                      <b>#{q.number}</b>
                    </Link>
                  </td>
                  <td>
                    {PLAN_LABELS[q.plan_tier] ?? q.plan_tier}
                    <span className="dx-muted"> · {q.billing === "annual" ? "annual" : "monthly"}</span>
                  </td>
                  <td className="r num">${Number(q.monthly_price).toLocaleString("en-US")}/mo</td>
                  <td>
                    <span className={`pill ${STATUS_TONE[q.status] ?? "navy"}`}>{q.status.toUpperCase()}</span>
                    {q.sent_at && q.status === "sent" ? <span className="dx-muted"> {fmtShort(q.sent_at)}</span> : null}
                  </td>
                  <td>
                    {fmtShort(q.valid_until)}
                    {lapsed ? <span className="pill warn"> PAST</span> : null}
                  </td>
                  <td>
                    <QuoteRowActions id={q.id} oppId={opp.id} status={q.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : !loadError ? (
        <div className="empty-note">No proposals yet. Draft one below, then open it to print or save as PDF.</div>
      ) : null}
      {!closed ? (
        <NewProposalForm
          oppId={opp.id}
          defaults={{
            plan,
            billing,
            locations: account?.locations ?? null,
            contactId: primary?.id ?? "",
            validUntil: addDays(today, 30),
          }}
          prices={prices}
          contacts={contacts.map((c) => ({ id: c.id, label: c.title ? `${c.name} · ${c.title}` : c.name }))}
          minDate={today}
        />
      ) : null}
    </div>
  );
}
