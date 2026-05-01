/**
 * /employer/billing — current subscription + invoice history.
 *
 * Shows the active subscription's tier, status, current period, and any
 * special flags (cancel-at-period-end, founding rate lock). Lists the most
 * recent invoices with links to the Stripe-hosted invoice page (where the
 * user can download a receipt PDF).
 *
 * "Manage Subscription" opens the Stripe Customer Portal — a Stripe-hosted
 * page where the user can change card, change plan, or cancel. Cancel /
 * plan-change events flow back to us via webhook.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Receipt,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRICING_TIERS } from "@/lib/stripe/prices";
import { openCustomerPortal } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

interface PageProps {
  searchParams: Promise<{ portal_error?: string }>;
}

export default async function EmployerBillingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/sign-up");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, tier, status, current_period_start, current_period_end, cancel_at_period_end, founding_locked_until, stripe_customer_id"
    )
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  // Empty state if no subscription
  if (!sub) {
    return (
      <EmployerShell active="billing">
        <Header />
        {sp.portal_error === "1" && <PortalErrorBanner />}
        <NoSubscriptionEmpty />
      </EmployerShell>
    );
  }

  // Pull invoice history (most recent first)
  const { data: rawInvoices } = await supabase
    .from("invoices")
    .select(
      "id, stripe_invoice_id, amount_cents, currency, status, paid_at, hosted_invoice_url, invoice_pdf_url, period_start, period_end, created_at"
    )
    .eq("subscription_id", sub.id as string)
    .order("created_at", { ascending: false })
    .limit(24);

  const subscription = sub as SubscriptionRow;
  const invoices = (rawInvoices ?? []) as InvoiceRow[];
  const tierConfig = PRICING_TIERS[subscription.tier as keyof typeof PRICING_TIERS] ?? null;

  return (
    <EmployerShell active="billing">
      <Header />
      {sp.portal_error === "1" && <PortalErrorBanner />}

      {/* Status warnings (past-due, canceling) */}
      {subscription.status === "past_due" && (
        <WarningBanner
          title="Payment past due."
          body="Your last invoice didn't go through. Update your payment method to keep your subscription active."
        />
      )}
      {subscription.cancel_at_period_end && subscription.status === "active" && (
        <WarningBanner
          title="Subscription ends at period close."
          body={`Your subscription is set to cancel on ${formatDate(subscription.current_period_end)}. You can resume it anytime before then in the Customer Portal.`}
        />
      )}
      {subscription.status === "canceled" && (
        <WarningBanner
          title="Subscription canceled."
          body="You no longer have an active subscription. Reactivate via the Customer Portal or contact cam@dsohire.com."
        />
      )}

      {/* Current plan card */}
      <section className="mb-12">
        <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Current Plan
        </h2>
        <div className="border border-[var(--rule-strong)] bg-cream/40 p-7 max-w-[820px]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="text-2xl font-extrabold tracking-[-0.6px] text-ink">
                  {tierConfig?.name ?? subscription.tier}
                </div>
                <StatusBadge status={subscription.status} />
              </div>
              {tierConfig && (
                <div className="text-[14px] text-slate-body">
                  ${tierConfig.monthlyPrice}/month · {tierConfig.tagline}
                </div>
              )}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-6 border-t border-[var(--rule)]">
            <Field
              label="Current period"
              value={
                subscription.current_period_start && subscription.current_period_end
                  ? `${formatDate(subscription.current_period_start)} → ${formatDate(subscription.current_period_end)}`
                  : "—"
              }
            />
            <Field
              label="Renews / ends"
              value={
                subscription.cancel_at_period_end
                  ? `Cancels ${formatDate(subscription.current_period_end)}`
                  : subscription.current_period_end
                    ? `Renews ${formatDate(subscription.current_period_end)}`
                    : "—"
              }
            />
            {subscription.founding_locked_until && (
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-heritage" />
                    Founding rate lock
                  </span>
                }
                value={`Locked at ${tierConfig ? `$${tierConfig.monthlyPrice}` : "founding price"}/month until ${formatDate(subscription.founding_locked_until)}`}
              />
            )}
          </dl>

          <form action={openCustomerPortal} className="mt-7">
            <button
              type="submit"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage Subscription
            </button>
          </form>
          <p className="mt-3 text-[12px] text-slate-meta">
            Opens Stripe&apos;s Customer Portal. Update card, change plan,
            cancel, or download receipts there.
          </p>
        </div>
      </section>

      {/* Invoice history */}
      <section>
        <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Invoice History
        </h2>
        {invoices.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream p-8 max-w-[820px]">
            <Receipt className="h-7 w-7 text-slate-meta mb-3" />
            <p className="text-[14px] text-slate-body leading-relaxed">
              No invoices yet. Your first invoice will appear here once
              Stripe processes the next billing cycle.
            </p>
          </div>
        ) : (
          <ul className="list-none border-t border-[var(--rule)] max-w-[820px]">
            {invoices.map((inv) => (
              <InvoiceRowItem key={inv.id} invoice={inv} />
            ))}
          </ul>
        )}
      </section>
    </EmployerShell>
  );
}

interface SubscriptionRow {
  id: string;
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  founding_locked_until: string | null;
  stripe_customer_id: string | null;
}

interface InvoiceRow {
  id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

/* ───── shared blocks ───── */

function Header() {
  return (
    <header className="mb-10">
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
        Billing
      </div>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
        Subscription &amp; invoices
      </h1>
      <p className="mt-3 text-[14px] text-slate-body max-w-[640px]">
        Your current plan, billing cycle, and history. Card changes, plan
        changes, and cancellations happen in the Stripe Customer Portal.
      </p>
    </header>
  );
}

function PortalErrorBanner() {
  return (
    <div className="mb-8 max-w-[820px] bg-red-50 border-l-4 border-red-500 p-4">
      <p className="text-[13px] text-red-900">
        <strong className="font-semibold">Couldn&apos;t open the Customer Portal.</strong>{" "}
        Refresh and try again, or email cam@dsohire.com if it persists.
      </p>
    </div>
  );
}

function WarningBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8 max-w-[820px] bg-yellow-50 border-l-4 border-yellow-500 p-4 flex gap-3">
      <AlertTriangle className="h-4 w-4 text-yellow-700 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-[13px] text-yellow-900 font-semibold">{title}</p>
        <p className="mt-1 text-[12px] text-yellow-900/85 leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

function NoSubscriptionEmpty() {
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 max-w-[640px]">
      <CheckCircle2 className="h-10 w-10 text-slate-meta mb-5" />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        Activate your subscription.
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed mb-7">
        You need an active subscription to post jobs. Pick a plan, run
        through Stripe Checkout (test mode for now), and you&apos;ll be
        billed monthly.
      </p>
      <Link
        href="/employer/checkout"
        className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
      >
        Start Checkout
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-heritage text-ivory" },
    trialing: { label: "Trialing", cls: "bg-cream text-ink border border-[var(--rule-strong)]" },
    past_due: { label: "Past due", cls: "bg-yellow-100 text-yellow-900 border border-yellow-400" },
    canceled: { label: "Canceled", cls: "bg-slate-meta text-ivory" },
    incomplete: { label: "Incomplete", cls: "bg-cream text-slate-body border border-[var(--rule-strong)]" },
    incomplete_expired: { label: "Expired", cls: "bg-cream text-slate-meta" },
    unpaid: { label: "Unpaid", cls: "bg-red-100 text-red-900 border border-red-400" },
  };
  const m = map[status] ?? { label: status, cls: "bg-cream text-slate-body" };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold tracking-[1.5px] uppercase ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold tracking-[1.8px] uppercase text-slate-meta mb-1">
        {label}
      </dt>
      <dd className="text-[14px] text-ink">{value}</dd>
    </div>
  );
}

function InvoiceRowItem({ invoice }: { invoice: InvoiceRow }) {
  const dollars = formatCurrency(invoice.amount_cents, invoice.currency);
  const date = invoice.paid_at ?? invoice.created_at;

  return (
    <li className="border-b border-[var(--rule)] py-4 px-2 flex items-center gap-6 hover:bg-cream/40 transition-colors">
      <Receipt className="h-4 w-4 text-slate-meta flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-ink">
          {dollars}
        </div>
        <div className="text-[11px] text-slate-meta tracking-[0.3px]">
          {formatDate(date)} ·{" "}
          <span
            className={
              invoice.status === "paid"
                ? "text-heritage-deep font-semibold"
                : invoice.status === "open"
                  ? "text-yellow-800"
                  : "text-slate-meta"
            }
          >
            {invoice.status}
          </span>
        </div>
      </div>

      {invoice.hosted_invoice_url && (
        <a
          href={invoice.hosted_invoice_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink inline-flex items-center gap-1.5 transition-colors"
        >
          View
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

/* ───── formatters ───── */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}
