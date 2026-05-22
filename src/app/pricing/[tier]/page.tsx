/**
 * /pricing/[tier] — per-tier landing pages (Solo / Growth / Scale / Enterprise).
 *
 * Walks a prospective dental group through what they get at a tier and who
 * it's the perfect fit for. Pricing + feature data come from PRICING_TIERS
 * (the checkout source of truth); the "who's the perfect fit" narrative comes
 * from ./tier-content. Renders bare — /pricing/layout.tsx supplies the nav +
 * footer, so no SiteShell here.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { PRICING_TIERS, type PricingTier } from "@/lib/stripe/prices";
import { TIER_PAGE_CONTENT } from "./tier-content";

const TIER_ORDER: PricingTier[] = ["solo", "growth", "scale", "enterprise"];

function isPricingTier(v: string): v is PricingTier {
  return (TIER_ORDER as string[]).includes(v);
}

interface PageProps {
  params: Promise<{ tier: string }>;
}

export function generateStaticParams() {
  return TIER_ORDER.map((tier) => ({ tier }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tier } = await params;
  if (!isPricingTier(tier)) return { title: "Plans — DSO Hire" };
  const t = PRICING_TIERS[tier];
  return {
    title: `${t.name} plan — DSO Hire`,
    description: `${t.description}. ${TIER_PAGE_CONTENT[tier].headline}`,
  };
}

export default async function TierPage({ params }: PageProps) {
  const { tier } = await params;
  if (!isPricingTier(tier)) notFound();

  const t = PRICING_TIERS[tier];
  const content = TIER_PAGE_CONTENT[tier];
  const others = TIER_ORDER.filter((x) => x !== tier);
  const checkoutHref = `/employer/checkout?tier=${t.id}`;

  return (
    <article className="pt-[120px] pb-24 px-6 sm:px-14 max-w-[1080px] mx-auto">
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All plans
      </Link>

      {/* ── Hero ── */}
      <header className="mb-14 max-w-[760px]">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Dental Groups · {t.name} plan
          </span>
          {t.badge && (
            <span className="inline-flex items-center px-2.5 py-1 bg-heritage text-ivory text-[10px] font-bold tracking-[1.5px] uppercase">
              {t.badge}
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1px] leading-[1.05] text-ink mb-5">
          {content.headline}
        </h1>
        <p className="text-lg text-slate-body leading-relaxed mb-8">
          {t.description}.
        </p>

        {/* Price block */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2 border-y border-[var(--rule)] py-5 mb-8">
          <div>
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
              Monthly
            </div>
            <div className="text-3xl font-extrabold tracking-[-0.5px] text-ink">
              ${t.monthlyPrice.toLocaleString()}
              <span className="text-base font-semibold text-slate-meta"> / mo</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
              Billed annually
            </div>
            <div className="text-3xl font-extrabold tracking-[-0.5px] text-heritage-deep">
              ${t.annualMonthlyEquivalent.toLocaleString()}
              <span className="text-base font-semibold text-slate-meta"> / mo</span>
            </div>
            <div className="text-[12px] text-slate-meta mt-0.5">
              ${t.annualPrice.toLocaleString()} billed once a year (~10% off)
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href={checkoutHref}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Get started with {t.name}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            Compare all plans
          </Link>
        </div>
      </header>

      {/* ── Who it's for + best fit ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 lg:gap-16 mb-14">
        <div>
          <h2 className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Who it&apos;s for
          </h2>
          <p className="text-[15px] text-ink leading-relaxed">
            {content.whoItsFor}
          </p>
        </div>
        <div className="border border-[var(--rule)] bg-cream/40 p-6">
          <h2 className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
            You&apos;re a great fit if…
          </h2>
          <ul className="space-y-3">
            {content.bestIf.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[14px] text-ink leading-snug">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-heritage" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── What's included ── */}
      <section className="mb-14">
        <h2 className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-5">
          What&apos;s included
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3.5">
          {t.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink leading-snug">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-heritage" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Sizing nudges ── */}
      {(content.considerLowerIf || content.considerHigherIf) && (
        <section className="mb-14 space-y-2.5">
          {content.considerLowerIf && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <span className="font-semibold text-ink">Smaller? </span>
              {content.considerLowerIf}
            </p>
          )}
          {content.considerHigherIf && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <span className="font-semibold text-ink">Bigger? </span>
              {content.considerHigherIf}
            </p>
          )}
        </section>
      )}

      {/* ── Other plans ── */}
      <section className="mb-14">
        <h2 className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-5">
          Other plans
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {others.map((o) => {
            const ot = PRICING_TIERS[o];
            return (
              <Link
                key={o}
                href={`/pricing/${o}`}
                className="group bg-white p-5 hover:bg-cream/50 transition-colors"
              >
                <div className="text-[15px] font-extrabold text-ink mb-0.5">
                  {ot.name}
                </div>
                <div className="text-[13px] font-semibold text-heritage-deep mb-1.5">
                  ${ot.monthlyPrice.toLocaleString()} / mo
                </div>
                <div className="text-[12px] text-slate-meta leading-snug">
                  {ot.tagline}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-ink text-ivory p-8 sm:p-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-light mb-3">
          Ready when you are
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] mb-5 max-w-[640px]">
          Post across every location for one flat monthly fee.
        </h2>
        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href={checkoutHref}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            Get started with {t.name}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 border border-white/25 text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-white/10 transition-colors"
          >
            See the full comparison
          </Link>
        </div>
      </section>
    </article>
  );
}
