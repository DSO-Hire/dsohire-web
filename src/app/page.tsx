import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllTiers, type TierConfig } from "@/lib/stripe/prices";
import { SiteShell } from "@/components/marketing/site-shell";

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <ProofStrip />
      <Comparison />
      <PricingTeaser />
      <HowItWorks />
      <FinalCta />
    </SiteShell>
  );
}

/* ═══════════════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-[140px] pb-28 px-6 sm:px-14">
      {/* 80px grid */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%)",
        }}
      />
      {/* Heritage glow */}
      <div
        aria-hidden
        className="absolute -top-[15%] -right-[10%] w-[60vw] h-[60vw] pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-16 lg:gap-20 items-center">
        {/* Left column */}
        <div>
          <div className="flex items-center gap-3.5 mb-8">
            <span className="block w-7 h-px bg-heritage" />
            <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
              The Job Board Built for DSOs
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-[80px] font-extrabold tracking-[-0.025em] leading-[0.98] text-ink mb-7">
            Multi-location hiring,
            <br />
            <em className="not-italic relative whitespace-nowrap text-heritage-light">
              one flat fee.
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-1.5 h-2 -z-10"
                style={{ background: "var(--heritage-tint)" }}
              />
            </em>
          </h1>

          <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[520px] mb-10">
            Built for dental support organizations operating 10–50 practices. Post unlimited
            roles across every location for a flat monthly subscription — no per-listing
            charges, no 15–25% placement fees, no recruiter middlemen.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 mb-9">
            <Link
              href="#pricing"
              className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Start Posting Jobs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
            >
              Browse Jobs
            </Link>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-body tracking-[0.4px]">
            <span className="block w-1.5 h-1.5 bg-heritage rounded-full" />
            <span>
              Plans from <strong className="text-ink font-bold">$299/mo</strong> · Founding-customer pricing now open
            </span>
          </div>
        </div>

        {/* Right column: stylized employer dashboard preview */}
        <HeroDashboardPreview />
      </div>
    </section>
  );
}

function HeroDashboardPreview() {
  return (
    <div className="relative">
      <div
        className="bg-white border border-[var(--rule)] overflow-hidden"
        style={{
          boxShadow:
            "0 30px 60px -30px rgba(7,15,28,0.18), 0 10px 24px -12px rgba(7,15,28,0.10)",
          transform: "rotate(0.5deg)",
        }}
      >
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[var(--rule)] bg-cream">
          <span className="block w-2 h-2 rounded-full bg-ivory-deep" />
          <span className="block w-2 h-2 rounded-full bg-ivory-deep" />
          <span className="block w-2 h-2 rounded-full bg-ivory-deep" />
          <span className="ml-3 text-[11px] tracking-[0.4px] text-slate-meta">
            dsohire.com /{" "}
            <strong className="text-ink font-semibold">employer dashboard</strong>
          </span>
        </div>
        {/* Body */}
        <div className="px-7 pt-7 pb-6">
          <div className="text-[9px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2.5">
            Active Listing · Posted 2d ago
          </div>
          <div className="text-lg font-bold tracking-[-0.4px] text-ink mb-1.5">
            Associate Dentist — General
          </div>
          <div className="text-xs text-slate-body mb-5">
            3 of your locations · Austin TX, Round Rock TX, Cedar Park TX
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            <DashboardTag>Full Time</DashboardTag>
            <DashboardTag>$190–$240K</DashboardTag>
            <DashboardTag>Sign-On Bonus</DashboardTag>
          </div>
          <div className="grid grid-cols-3 -mx-7 border-t border-[var(--rule)]">
            <DashboardStat num="42" label="Views" />
            <DashboardStat num="8" label="Applications" />
            <DashboardStat num="3" label="In Review" last />
          </div>
        </div>
      </div>

      {/* Floating notification */}
      <div
        className="absolute -bottom-5 -left-6 bg-white border border-[var(--rule)] px-4 py-3.5 flex items-center gap-3"
        style={{
          boxShadow: "0 14px 28px -14px rgba(7,15,28,0.18)",
          transform: "rotate(-1.5deg)",
        }}
      >
        <span className="flex items-center justify-center w-8 h-8 bg-heritage text-ink font-extrabold text-[13px] tracking-[-0.4px]">
          +
        </span>
        <div className="text-[11px] text-ink leading-snug font-semibold">
          New application received
          <small className="block text-[10px] font-normal text-slate-body tracking-[0.3px] mt-0.5">
            Hygienist · Pacific Northwest Dental
          </small>
        </div>
      </div>
    </div>
  );
}

function DashboardTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2.5 py-1 text-[10px] font-bold tracking-[1.2px] uppercase text-heritage-deep"
      style={{ background: "var(--heritage-tint)" }}
    >
      {children}
    </span>
  );
}

function DashboardStat({ num, label, last }: { num: string; label: string; last?: boolean }) {
  return (
    <div className={`px-4 pt-4 pb-3.5 ${last ? "" : "border-r border-[var(--rule)]"}`}>
      <div className="text-[22px] font-extrabold tracking-[-0.8px] text-ink leading-none mb-1.5">
        {num}
      </div>
      <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta">
        {label}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PROOF STRIP
═══════════════════════════════════════════════════════ */

function ProofStrip() {
  return (
    <div className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-8">
      <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-10">
        <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-slate-body">
          Designed With{" "}
          <strong className="text-ink">Mid-Market DSO Operators</strong>
        </div>
        <div className="flex flex-wrap gap-9 items-center">
          <ProofTagline>10–50 Locations</ProofTagline>
          <ProofTagline>Unlimited Listings</ProofTagline>
          <ProofTagline>Flat Monthly Fee</ProofTagline>
          <ProofTagline>No Placement Charges</ProofTagline>
        </div>
      </div>
    </div>
  );
}

function ProofTagline({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-extrabold tracking-[-0.3px] text-[15px] text-slate-meta opacity-55">
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   COMPARISON
═══════════════════════════════════════════════════════ */

function Comparison() {
  return (
    <section className="px-6 sm:px-14 pt-28 pb-24 max-w-[1240px] mx-auto">
      <SectionEyebrow>The Gap</SectionEyebrow>
      <SectionHeadline>
        Built for the operators DentalPost and staffing agencies don&apos;t serve.
      </SectionHeadline>
      <SectionSub>
        Existing options were built for solo practices or for one-off retained searches.
        Neither fits the operating model of a multi-location DSO that&apos;s hiring across
        roles and regions every week.
      </SectionSub>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mt-10">
        <CompareCell
          label="Option A"
          name="DentalPost"
          tagline="The default — but it was built for solo practices."
          items={[
            "Per-listing pricing that punishes multi-location postings",
            "No native multi-location job posting",
            "No team-based employer accounts",
            "Designed around individual practice owners",
          ]}
        />
        <CompareCell
          label="Option B"
          name="Staffing agencies"
          tagline="Effective, but priced for one-off executive searches."
          items={[
            "15–25% of first-year salary per placement",
            "Long engagement timelines for routine roles",
            "Limited visibility into the candidate pipeline",
            "No leverage as your hiring volume grows",
          ]}
        />
        <CompareCell
          label="DSO Hire"
          name="A flat-fee job board, built for DSOs."
          tagline="Subscribe once, post unlimited roles across every practice you operate."
          items={[
            "One subscription covers every location",
            "Unlimited active listings on every tier above Founding",
            "Multi-location job posting in a single flow",
            "Team accounts for your recruiters and regional managers",
          ]}
          featured
        />
      </div>
    </section>
  );
}

function CompareCell({
  label,
  name,
  tagline,
  items,
  featured,
}: {
  label: string;
  name: string;
  tagline: string;
  items: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`relative p-9 flex flex-col ${
        featured ? "bg-ink text-ivory" : "bg-white"
      }`}
    >
      {featured && <span className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />}
      <div
        className={`text-[10px] font-bold tracking-[2.5px] uppercase mb-4 ${
          featured ? "text-heritage" : "text-slate-body"
        }`}
      >
        {label}
      </div>
      <div className="text-[22px] font-extrabold tracking-[-0.6px] mb-2.5 leading-tight">
        {name}
      </div>
      <div
        className={`text-[13px] mb-7 leading-snug ${
          featured ? "text-ivory/70" : "text-slate-body"
        }`}
      >
        {tagline}
      </div>
      <ul
        className={`mt-auto pt-5 list-none border-t ${
          featured ? "border-white/10" : "border-[var(--rule)]"
        }`}
      >
        {items.map((item, i) => (
          <li
            key={i}
            className={`text-[13px] py-2.5 flex items-start gap-2.5 leading-snug ${
              featured ? "text-ivory" : "text-slate-body"
            }`}
          >
            <span
              className={`flex-shrink-0 font-extrabold ${
                featured ? "text-heritage" : "text-heritage"
              }`}
            >
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PRICING — driven from src/lib/stripe/prices.ts
═══════════════════════════════════════════════════════ */

function PricingTeaser() {
  const tiers = getAllTiers();
  return (
    <section id="pricing" className="bg-white border-t border-[var(--rule)] px-6 sm:px-14 py-28">
      <div className="max-w-[1240px] mx-auto">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <SectionHeadline>One flat fee. Sized to your footprint.</SectionHeadline>
        <SectionSub>
          Pick the tier that matches your practice count. Cancel or change tiers anytime.
        </SectionSub>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mt-10">
          {tiers.map((tier) => (
            <PricingTier key={tier.id} tier={tier} />
          ))}
        </div>

        <p className="mt-10 text-[13px] text-slate-body text-center leading-relaxed">
          All tiers include unlimited multi-location posting, candidate dashboards, and
          Stripe-secured billing.{" "}
          <strong className="text-ink font-bold">
            No per-listing fees. No placement fees. Ever.
          </strong>
        </p>
      </div>
    </section>
  );
}

function PricingTier({ tier }: { tier: TierConfig }) {
  const isFeatured = tier.badge === "Most popular";
  return (
    <div
      className={`relative p-9 flex flex-col ${isFeatured ? "bg-cream pt-16" : "bg-white"}`}
    >
      {isFeatured && (
        <div className="absolute top-0 inset-x-0 h-7 bg-ink text-heritage flex items-center justify-center text-[9px] font-bold tracking-[2px] uppercase">
          Most Popular
        </div>
      )}
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3.5">
        {tier.name}
      </div>
      <div className="text-lg font-extrabold tracking-[-0.4px] mb-1.5 text-ink">
        {tier.name}
      </div>
      <div className="text-xs text-slate-body mb-6 min-h-[34px] leading-snug">
        {tier.tagline}
      </div>

      <div className="flex items-baseline gap-1.5 mb-1.5">
        <div className="text-[40px] font-extrabold tracking-[-1.5px] text-ink leading-none">
          ${tier.monthlyPrice.toLocaleString()}
        </div>
        <div className="text-[13px] text-slate-body font-medium">/ month</div>
      </div>
      <div className="text-[11px] text-slate-meta tracking-[0.4px] mb-7 min-h-4">
        {tier.founding && "Limited — accepting applications now"}
        {tier.id === "starter" && "Most chosen for sub-20 location operators"}
        {tier.id === "growth" && "Unlimited listings unlocked"}
        {tier.id === "enterprise" && "Account management included"}
      </div>

      <Link
        href={`/employer/sign-up?tier=${tier.id}`}
        className={`block text-center px-4 py-3.5 text-[11px] font-bold tracking-[1.5px] uppercase mb-6 transition-colors border ${
          isFeatured
            ? "bg-ink text-ivory border-ink hover:bg-ink-soft"
            : "bg-ivory text-ink border-[var(--rule-strong)] hover:bg-ink hover:text-ivory hover:border-ink"
        }`}
      >
        {tier.id === "founding" && "Apply for Founding"}
        {tier.id === "starter" && "Start with Starter"}
        {tier.id === "growth" && "Choose Growth"}
        {tier.id === "enterprise" && "Talk to Cameron"}
      </Link>

      <ul className="list-none border-t border-[var(--rule)] pt-4">
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className="text-[12.5px] text-ink py-1.5 flex items-start gap-2 leading-snug"
          >
            <span className="text-heritage-light font-extrabold flex-shrink-0">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HOW IT WORKS — DARK BAND
═══════════════════════════════════════════════════════ */

function HowItWorks() {
  return (
    <section id="how" className="bg-ink text-ivory px-6 sm:px-14 py-28 relative overflow-hidden">
      {/* Heritage glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "80%",
          width: "540px",
          height: "540px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,122,96,0.08), transparent 65%)",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage mb-3.5">
          How It Works
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ivory max-w-[720px] mb-5">
          From subscription to staffed in three steps.
        </h2>
        <p className="text-base text-ivory/60 max-w-[620px] leading-[1.7] mb-14">
          Most DSOs are posting their first role within an hour of signing up.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-6">
          <HowStep
            n="01"
            title="Subscribe in minutes"
            body="Pick the tier that matches your practice count, pay through Stripe, and your DSO account is live. No demos required, no sales calls, no implementation fees."
          />
          <HowStep
            n="02"
            title="Post once, hire across every location"
            body="Write a role once and assign it to as many of your practices as you need. Your team — recruiters, regional managers, office managers — all post and review under a single account."
          />
          <HowStep
            n="03"
            title="Review, interview, hire"
            body="Applications land in a shared dashboard with status tracking. Move candidates through your pipeline, leave internal notes, and hire — without paying a placement fee on the way out."
          />
        </div>
      </div>
    </section>
  );
}

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-t border-white/10 pt-7">
      <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-heritage mb-4">
        Step {n}
      </div>
      <div className="text-[22px] font-extrabold tracking-[-0.6px] text-ivory mb-3.5 leading-tight">
        {title}
      </div>
      <div className="text-sm text-ivory/70 leading-[1.7]">{body}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FINAL CTA
═══════════════════════════════════════════════════════ */

function FinalCta() {
  return (
    <section className="bg-ivory px-6 sm:px-14 py-28 text-center">
      <div className="max-w-[780px] mx-auto">
        <h2 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5">
          Ready to replace per-listing fees with one flat subscription?
        </h2>
        <p className="text-base text-slate-body leading-[1.7] mb-9">
          Founding-customer pricing is open through summer 2026. First five DSOs lock in
          $299/mo for a year in exchange for a public testimonial.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="#pricing"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            View Pricing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="mailto:cam@dsohire.com"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            Email Cameron
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION HELPERS
═══════════════════════════════════════════════════════ */

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
      {children}
    </div>
  );
}

function SectionHeadline({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-4">
      {children}
    </h2>
  );
}

function SectionSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base text-slate-body max-w-[620px] leading-[1.7]">
      {children}
    </p>
  );
}
