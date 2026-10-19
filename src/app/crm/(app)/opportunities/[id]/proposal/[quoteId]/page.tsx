import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { crmPageGate } from "@/lib/crm/auth";
import { UUID_RE } from "@/lib/crm/events";
import { PRICING_TIERS, isPricingTier } from "@/lib/stripe/prices";
import { CRM_TZ, todayIso } from "../../../../format";
import PrintButton from "./PrintButton";
import "./proposal.css";

export const metadata: Metadata = { title: "Proposal" };

type Quote = {
  id: string;
  number: number;
  opportunity_id: string;
  account_id: string;
  contact_id: string | null;
  plan_tier: string;
  billing: string;
  monthly_price: number | string;
  locations: number | null;
  valid_until: string;
  intro: string | null;
  notes: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
};

function longDate(iso: string): string {
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(bare ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: bare ? "UTC" : CRM_TZ,
  });
}

function usd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/* A printable one-page proposal. Inside the CRM shell on screen; the print
   stylesheet (proposal.css) hides the shell so "Print / Save as PDF" gives a
   clean letter-size document. Every price and plan detail is read from
   prices.ts; the value lines reuse the site's pricing copy verbatim. */
export default async function ProposalPage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await params;
  const gate = await crmPageGate(`/crm/opportunities/${id}/proposal/${quoteId}`);
  if (gate === "denied" || gate === "needs_mfa") return null;
  if (!UUID_RE.test(id) || !UUID_RE.test(quoteId)) notFound();
  const { supabase } = gate;

  const { data: qData } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("opportunity_id", id)
    .maybeSingle();
  const q = qData as Quote | null;
  if (!q || !isPricingTier(q.plan_tier)) notFound();

  const [accountRes, contactRes] = await Promise.all([
    supabase.from("crm_accounts").select("id, name").eq("id", q.account_id).maybeSingle(),
    q.contact_id
      ? supabase.from("crm_contacts").select("name, title").eq("id", q.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const accountName = String((accountRes.data as { name?: string } | null)?.name ?? "your group");
  const contact = contactRes.data as { name: string; title: string | null } | null;

  const tier = PRICING_TIERS[q.plan_tier];
  const annual = q.billing === "annual";
  const price = Number(q.monthly_price);
  const listMonthly = annual ? tier.annualMonthlyEquivalent : tier.monthlyPrice;
  const atList = price === listMonthly;
  /* Yearly amount: the tier's annual price from prices.ts at list; a custom
     Enterprise figure is that monthly price times twelve. */
  const yearly = annual ? (atList ? tier.annualPrice : Math.round(price * 12 * 100) / 100) : null;
  const signupPath = `/employer/sign-up?tier=${tier.id}&period=${annual ? "annual" : "monthly"}`;
  const expired = q.valid_until < todayIso();

  return (
    <div className="qp-page">
      <div className="qp-screen" role="toolbar" aria-label="Proposal actions">
        <Link className="dbtn dbtn-line dbtn-sm" href={`/crm/opportunities/${id}#dx-proposals`}>
          ← Back to opportunity
        </Link>
        <span className={`pill ${q.status === "accepted" ? "good" : q.status === "draft" ? "navy" : "warn"}`}>
          {q.status.toUpperCase()}
        </span>
        {expired ? <span className="pill crit">PAST VALID-UNTIL DATE</span> : null}
        <span className="qp-hint">Prints as one letter-size page. Choose Save as PDF in the print dialog for a file.</span>
        <PrintButton />
      </div>

      <article className="qp-doc" aria-label={`Proposal ${q.number}`}>
        <header className="qp-head">
          <BrandLockup height={40} />
          <div className="qp-headr">
            <div className="qp-eyebrow">PROPOSAL</div>
            <div className="qp-num">#{q.number}</div>
          </div>
        </header>

        <h1 className="qp-title">
          Proposal #{q.number} for {accountName}
        </h1>

        <dl className="qp-meta">
          <div>
            <dt>Prepared for</dt>
            <dd>
              {contact ? (
                <>
                  {contact.name}
                  {contact.title ? <span className="qp-sub">{contact.title}</span> : null}
                </>
              ) : (
                accountName
              )}
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{longDate(q.sent_at ?? q.created_at)}</dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{longDate(q.valid_until)}</dd>
          </div>
        </dl>

        {q.intro ? <p className="qp-intro">{q.intro}</p> : null}

        <section className="qp-plan" aria-label="Recommended plan">
          <div className="qp-planl">
            <div className="qp-eyebrow">RECOMMENDED PLAN</div>
            <div className="qp-planname">{tier.name}</div>
            <div className="qp-tagline">{tier.tagline}</div>
            {q.locations ? (
              <div className="qp-loc">
                {q.locations} {q.locations === 1 ? "location" : "locations"}
              </div>
            ) : null}
          </div>
          <div className="qp-planr">
            <div className="qp-price">
              {usd(price)}
              <span>/ month</span>
            </div>
            <div className="qp-billing">
              {annual ? `Billed annually · ${usd(yearly ?? 0)}/yr` : "Billed monthly · cancel anytime"}
            </div>
          </div>
        </section>

        <section className="qp-included" aria-label="What's included">
          <h2>What&apos;s included</h2>
          <ul>
            {tier.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="qp-every">
            Every tier includes multi-location posting, PracticeFit, candidate dashboards, and Stripe-secured billing.
          </p>
        </section>

        <section className="qp-value" aria-label="Pricing terms">
          <div>Post across every location for one flat monthly fee.</div>
          <div>No per-listing fees. No placement fees. Ever.</div>
          <div>Every cap shown is the enforced cap: what we advertise is what the code allows.</div>
        </section>

        {q.notes ? (
          <section className="qp-notes" aria-label="Notes">
            <h2>Notes</h2>
            <p>{q.notes}</p>
          </section>
        ) : null}

        <section className="qp-next" aria-label="Next steps">
          <h2>Next steps</h2>
          {tier.id === "enterprise" && !atList ? (
            <p>
              Reply to confirm, and I will set up your {tier.name} subscription at the price above before{" "}
              {longDate(q.valid_until)}.
            </p>
          ) : (
            <p>
              Start your subscription at{" "}
              <a href={`https://dsohire.com${signupPath}`}>dsohire.com{signupPath}</a>. Choose {tier.name},{" "}
              {annual ? "billed annually" : "billed monthly"}. Questions first? Reply any time.
            </p>
          )}
        </section>

        <footer className="qp-foot">
          <div>
            <b>Cam Eslinger</b>, Founder
          </div>
          <div>
            <a href="mailto:cam@dsohire.com">cam@dsohire.com</a> · <a href="https://dsohire.com">dsohire.com</a>
          </div>
        </footer>
      </article>
    </div>
  );
}
