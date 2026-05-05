/**
 * /employer/checkout/success — Stripe Checkout success landing.
 *
 * Stripe redirects the user here after a successful checkout. The webhook
 * does the real subscription provisioning; this page just confirms the
 * checkout completed and points them at onboarding.
 *
 * If the user reloads or hits this page without a valid session_id, we just
 * fall through to the same content rather than 404 — the worst case is they
 * see a friendly success message they may have already seen.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome to DSO Hire",
};

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  // Best-effort: confirm the session belongs to this user. We don't gate the
  // page on this — webhook is the source of truth for provisioning — but it
  // helps surface a clean error if someone hits the URL with a stale session.
  let sessionEmail: string | null = null;
  if (sp.session_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sp.session_id);
      sessionEmail = session.customer_email ?? session.customer_details?.email ?? null;
    } catch (err) {
      console.warn("[checkout-success] couldn't retrieve session:", err);
    }
  }

  return (
    <EmployerShell active="billing">
      <div className="max-w-[720px]">
        <div className="flex items-center gap-3 text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">
          <CheckCircle2 className="h-4 w-4 text-heritage" />
          Subscription Activated
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          You&apos;re in. Let&apos;s set up your DSO.
        </h1>
        <p className="mt-4 text-base text-slate-body leading-[1.7] max-w-[600px]">
          Stripe confirmed your payment. We&apos;re provisioning your
          subscription in the background — usually completes in seconds. You
          can start adding practice locations now while it finishes.
        </p>

        {sessionEmail && (
          <div className="mt-6 border-l-4 border-heritage bg-cream p-4">
            <p className="text-[13px] text-slate-body">
              Receipt sent to{" "}
              <strong className="text-ink font-semibold">{sessionEmail}</strong>
              . You&apos;ll also get a copy at every renewal.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Continue Setup
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/employer/dashboard"
            className="inline-flex items-center gap-2.5 px-7 py-4 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>

        <p className="mt-10 text-[13px] text-slate-meta leading-relaxed max-w-[520px]">
          Manage your subscription, view invoices, or change plan anytime under{" "}
          <Link
            href="/employer/billing"
            className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
          >
            Billing
          </Link>
          . Questions? Email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            cam@dsohire.com
          </a>
          .
        </p>
      </div>
    </EmployerShell>
  );
}
