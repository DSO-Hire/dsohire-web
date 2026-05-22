/**
 * / — the neutral dual-doorway home for DSO Hire.
 *
 * Part of the dual-lens website restructure. DSO Hire is a two-sided
 * marketplace; this page is deliberately NEUTRAL — it doesn't pitch either
 * side in depth, it routes. The two fully-realized side homes are:
 *   - /for-dental-groups        — the employer home (kanban, pricing, ROI, etc.)
 *   - /for-candidates  — the dental-professional home (jobs, roles, etc.)
 *
 * SEO posture: `/` is the highest-authority URL, so it stays a substantive
 * brand page (not a thin chooser) — but it carries brand/marketplace-level
 * keywords only, leaving the audience-intent keywords to the two side pages
 * so they don't cannibalize each other.
 */

import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  Hammer,
  Stethoscope,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "DSO Hire — Dental hiring, done direct.",
  },
  description:
    "DSO Hire is the dental-only job platform connecting multi-location dental groups (DSOs) with dental professionals — directly. No per-listing fees, no placement fees, no agency middlemen. Whether you're hiring across your practices or looking for your next dental role, start here.",
};

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <MarketplaceBand />
      <WhyDental />
      <ClosingDoorways />
    </SiteShell>
  );
}

/* ═══════════════════════════════════════════════════════
   HERO — neutral framing + the equal-weight dual entry
═══════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-[120px] pb-14 px-6 sm:px-14">
      {/* 80px brand grid, masked toward the top-left */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-[18%] left-1/2 -translate-x-1/2 w-[70vw] h-[70vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-[1180px] mx-auto text-center">
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.8px] uppercase text-ink border border-heritage/35 mb-5"
          style={{
            background: "var(--heritage-tint)",
            boxShadow: "0 0 0 4px var(--heritage-glow)",
          }}
        >
          <span className="text-heritage-deep">★</span>
          <span>The dental-only hiring platform</span>
        </span>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.025em] leading-[1.02] text-ink mb-4">
          Dental hiring,{" "}
          <em className="not-italic text-heritage-light">done direct.</em>
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[600px] mx-auto mb-9">
          The dental-only job platform — connecting multi-location dental groups
          with dental professionals, directly. No agencies, no per-listing fees,
          no middlemen.
        </p>

        {/* ── The equal-weight dual entry — bold full-color calling cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
          <DoorwayPanel
            accent="ink"
            icon={Building2}
            eyebrow="Dental Groups"
            title="Hiring across your practices"
            body="Post across every practice on one flat monthly subscription, with an applicant pipeline built for the way dental groups hire."
            proof="Flat monthly fee · No per-listing fees · No placement charges"
            ctaLabel="Explore Dental Group Hiring"
            href="/for-dental-groups"
          />
          <DoorwayPanel
            accent="heritage"
            icon={Stethoscope}
            eyebrow="Job Candidates"
            title="Find your next dental role"
            body="Real openings at multi-location dental groups — clinical and corporate, hygiene through specialist."
            proof="Free forever · Direct apply · Multi-location dental groups only"
            ctaLabel="Browse Dental Jobs"
            href="/for-candidates"
          />
        </div>
      </div>
    </section>
  );
}

function DoorwayPanel({
  accent,
  icon: Icon,
  eyebrow,
  title,
  body,
  proof,
  ctaLabel,
  href,
}: {
  /** "ink" = navy block, "heritage" = green block. Equal weight, distinct identity. */
  accent: "ink" | "heritage";
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  /** Single dot-separated proof line — keeps the panel compact (above the fold). */
  proof: string;
  ctaLabel: string;
  href: string;
}) {
  const isInk = accent === "ink";
  return (
    <Link
      href={href}
      className={`group relative flex flex-col p-7 sm:p-8 text-ivory motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 overflow-hidden ${
        isInk ? "bg-ink hover:bg-ink-soft" : "bg-heritage hover:bg-heritage-deep"
      }`}
      style={{
        boxShadow:
          "0 28px 56px -28px rgba(7,15,28,0.40), 0 12px 24px -12px rgba(7,15,28,0.18)",
      }}
    >
      {/* Top accent stripe — cross-lens color hint, adds depth to the flat block */}
      <span
        aria-hidden
        className={`absolute top-0 inset-x-0 h-[3px] ${
          isInk ? "bg-heritage" : "bg-ivory"
        }`}
      />

      {/* Solid ivory icon square — crisp on the colored bg, color-inverted icon */}
      <span
        className={`inline-flex items-center justify-center w-11 h-11 mb-5 bg-ivory ${
          isInk ? "text-ink" : "text-heritage-deep"
        }`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/65 mb-1.5">
        {eyebrow}
      </div>
      <div className="text-[24px] sm:text-[28px] font-extrabold tracking-[-0.6px] leading-[1.08] text-ivory mb-2.5">
        {title}
      </div>
      <p className="text-[14px] text-ivory/80 leading-[1.55] mb-3.5">{body}</p>

      {/* Single-line proof — dot-separated keyword chips */}
      <div className="text-[10.5px] font-bold tracking-[1.6px] uppercase text-ivory/55 mb-6">
        {proof}
      </div>

      {/* CTA — ivory on both cards so they pop with high contrast against
          both the navy and the green backgrounds, and the two CTAs read as
          a unified pair. */}
      <span className="mt-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 text-[12px] font-bold tracking-[1.8px] uppercase bg-ivory text-ink group-hover:bg-ivory-deep transition-colors">
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════
   MARKETPLACE BAND — the neutral two-sided explainer
═══════════════════════════════════════════════════════ */

function MarketplaceBand() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[760px] mx-auto text-center">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Why Two Doors
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-6">
          A hiring platform only works when both sides show up.
        </h2>
        <p className="text-base sm:text-lg text-slate-body leading-[1.7]">
          Dental groups need a steady pipeline of dental talent. Dental
          professionals need real openings at employers worth their time.
          Generic job boards serve neither well — so DSO Hire is dental-only on
          purpose. Every employer is a multi-location dental group — from
          established DSOs to independent owners running a handful of practices —
          with roles from chairside to the corporate teams behind a growing
          group, and both sides connect directly. That&apos;s why each audience
          gets its own front door — equal weight, built with the same care.
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   WHY DENTAL — three neutral value props (apply to both sides)
═══════════════════════════════════════════════════════ */

const VALUE_PROPS = [
  {
    icon: BadgeCheck,
    title: "Dental-only, on purpose",
    body: "Not a generic job board with a dental filter. Every employer is a multi-location dental group, and every role — clinical or corporate — sits inside the dental industry. Both sides show up because they belong here.",
  },
  {
    icon: ArrowLeftRight,
    title: "Direct — no middlemen",
    body: "Dental groups and dental professionals connect straight through the platform. No staffing agencies skimming placement fees, no recruiters gatekeeping the pipeline, no resume reselling.",
  },
  {
    icon: Hammer,
    title: "Built by operators",
    body: "Made by people who have run dental practices, for the way dental hiring actually works. The same small team that builds the product answers the email.",
  },
];

function WhyDental() {
  return (
    <section className="px-6 sm:px-14 py-24 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        What Makes It Different
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12">
        One platform, one industry, no middlemen.
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-white p-9">
            <span
              className="inline-flex items-center justify-center w-10 h-10 mb-5 text-heritage-deep"
              style={{ background: "var(--heritage-tint)" }}
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-[19px] font-extrabold tracking-[-0.4px] leading-tight text-ink mb-2.5">
              {title}
            </h3>
            <p className="text-[14px] text-slate-body leading-[1.65]">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   CLOSING DOORWAYS — dual CTA, equal weight
═══════════════════════════════════════════════════════ */

function ClosingDoorways() {
  return (
    <section className="bg-ink text-ivory px-6 sm:px-14 py-24 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: "620px",
          height: "620px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(77,122,96,0.10), transparent 65%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative max-w-[820px] mx-auto text-center">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.08] text-ivory mb-4">
          Pick your door.
        </h2>
        <p className="text-base text-ivory/60 leading-[1.7] max-w-[560px] mx-auto mb-10">
          Two audiences, one dental-only platform. Head to the side that fits —
          you can always switch.
        </p>
        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          <Link
            href="/for-dental-groups"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            <Building2 className="h-4 w-4" />
            I&apos;m a Dental Group
          </Link>
          <Link
            href="/for-candidates"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            <Stethoscope className="h-4 w-4" />
            I&apos;m a Dental Professional
          </Link>
        </div>
      </div>
    </section>
  );
}
