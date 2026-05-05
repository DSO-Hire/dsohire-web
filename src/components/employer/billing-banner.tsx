/**
 * BillingBanner — dashboard alert when subscription is in a non-active state.
 *
 * Renders nothing when the subscription is healthy (active + not canceling).
 * Otherwise shows a colored banner pointing the user at /employer/billing or
 * /employer/checkout.
 *
 * Pure server component — accepts a SubscriptionSummary and renders.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import type { SubscriptionSummary } from "@/lib/billing/subscription";

interface BillingBannerProps {
  /** null if the DSO has no subscription at all (never checked out yet). */
  subscription: SubscriptionSummary | null;
}

export function BillingBanner({ subscription }: BillingBannerProps) {
  // No subscription at all → call to action to start checkout
  if (!subscription) {
    return (
      <Banner
        tone="info"
        icon={<Sparkles className="h-4 w-4" />}
        title="Activate your subscription to start posting jobs."
        body="DSO Hire requires an active subscription to publish job postings. Pick a plan and run through Stripe Checkout to unlock the rest of the dashboard."
        ctaHref="/employer/checkout"
        ctaLabel="Activate Subscription"
      />
    );
  }

  // Active + healthy → no banner
  if (subscription.status === "active" && !subscription.cancel_at_period_end) {
    return null;
  }

  // Trialing → no banner (treated like active)
  if (subscription.status === "trialing" && !subscription.cancel_at_period_end) {
    return null;
  }

  // Active but ending → soft warning
  if (subscription.status === "active" && subscription.cancel_at_period_end) {
    return (
      <Banner
        tone="warn"
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Subscription ends at period close."
        body={`Your subscription is set to cancel${subscription.current_period_end ? ` on ${formatDate(subscription.current_period_end)}` : ""}. You can resume anytime in the Customer Portal.`}
        ctaHref="/employer/billing"
        ctaLabel="Manage Billing"
      />
    );
  }

  // past_due / unpaid → red banner
  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return (
      <Banner
        tone="alert"
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Payment past due — features locked."
        body="Stripe couldn't charge your card on the last invoice. Update your payment method to restore access to job posting and other paid features."
        ctaHref="/employer/billing"
        ctaLabel="Fix Payment"
      />
    );
  }

  // canceled / incomplete / incomplete_expired → red banner pointing at billing
  return (
    <Banner
      tone="alert"
      icon={<AlertTriangle className="h-4 w-4" />}
      title={
        subscription.status === "canceled"
          ? "Subscription canceled — features locked."
          : "Subscription not yet active — features locked."
      }
      body={
        subscription.status === "canceled"
          ? "Reactivate your subscription to continue posting jobs and managing applications."
          : "Finish checkout to activate your subscription. Job posting and application management require an active plan."
      }
      ctaHref={
        subscription.status === "canceled"
          ? "/employer/billing"
          : "/employer/checkout"
      }
      ctaLabel={
        subscription.status === "canceled"
          ? "Reactivate"
          : "Finish Checkout"
      }
    />
  );
}

/* ───── shared layout ───── */

interface BannerProps {
  tone: "info" | "warn" | "alert";
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}

function Banner({ tone, icon, title, body, ctaHref, ctaLabel }: BannerProps) {
  const toneClasses: Record<BannerProps["tone"], string> = {
    info: "bg-cream border-heritage",
    warn: "bg-yellow-50 border-yellow-500",
    alert: "bg-red-50 border-red-500",
  };
  const titleClasses: Record<BannerProps["tone"], string> = {
    info: "text-ink",
    warn: "text-yellow-900",
    alert: "text-red-900",
  };
  const bodyClasses: Record<BannerProps["tone"], string> = {
    info: "text-slate-body",
    warn: "text-yellow-900/85",
    alert: "text-red-900/85",
  };
  const iconClasses: Record<BannerProps["tone"], string> = {
    info: "text-heritage",
    warn: "text-yellow-700",
    alert: "text-red-700",
  };
  const ctaClasses: Record<BannerProps["tone"], string> = {
    info: "bg-ink text-ivory hover:bg-ink-soft",
    warn: "bg-yellow-700 text-white hover:bg-yellow-800",
    alert: "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <div
      className={`mb-8 border-l-4 p-5 max-w-[820px] flex flex-col sm:flex-row sm:items-center gap-4 ${toneClasses[tone]}`}
    >
      <div className="flex-1 flex gap-3">
        <span className={`flex-shrink-0 ${iconClasses[tone]}`}>{icon}</span>
        <div>
          <p className={`text-[14px] font-bold ${titleClasses[tone]}`}>
            {title}
          </p>
          <p className={`mt-1 text-[13px] leading-relaxed ${bodyClasses[tone]}`}>
            {body}
          </p>
        </div>
      </div>
      <Link
        href={ctaHref}
        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[10px] font-bold tracking-[1.8px] uppercase whitespace-nowrap transition-colors ${ctaClasses[tone]}`}
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
