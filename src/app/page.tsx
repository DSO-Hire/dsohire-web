/**
 * / — the neutral dual-doorway home for DSO Hire.
 *
 * Part of the dual-lens website restructure. DSO Hire is a two-sided
 * marketplace; this page is deliberately NEUTRAL — it doesn't pitch either
 * side in depth, it routes. The two fully-realized side homes are:
 *   - /for-dsos        — the employer home (kanban, pricing, ROI, etc.)
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
  Check,
  Hammer,
  Stethoscope,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "DSO Hire — Dental Hiring, Built for Multi-Location DSOs and Dental Professionals",
  description:
    "DSO Hire is the dental-only job platform connecting multi-location dental support organizations with dental professionals — directly. No per-listing fees, no placement fees, no agency middlemen. Whether you're hiring across your practices or looking for your next dental role, start here.",
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
    <section className="relative overflow-hidden pt-[140px] pb-24 px-6 sm:px-14">
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

      <div className="relative z-10 max-w-[1100px] mx-auto text-center">
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.8px] uppercase text-ink border border-heritage/35 mb-7"
          style={{
            background: "var(--heritage-tint)",
            boxShadow: "0 0 0 4px var(--heritage-glow)",
          }}
        >
          <span className="text-heritage-deep">★</span>
          <span>The dental-only hiring platform</span>
        </span>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.025em] leading-[1.02] text-ink mb-6">
          Dental hiring,{" "}
          <em className="not-italic text-heritage-light">done direct.</em>
        </h1>
        <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[680px] mx-auto mb-12">
          DSO Hire is the job platform built only for dental. Multi-location
          support organizations post and hire across every practice; dental
          professionals find real roles at verified group practices. No
          agencies, no per-listing fees, no middlemen.
        </p>

        {/* ── The equal-weight dual entry — bold full-color calling cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
          <DoorwayPanel
            accent="ink"
            icon={Building2}
            eyebrow="For DSOs"
            title="Hiring across your practices"
            body="Post unlimited roles for one flat monthly fee and run every applicant through a pipeline built for the way DSOs actually hire."
            points={[
              "Unlimited multi-location job postings",
              "Flat monthly fee — no placement fees, ever",
              "A real applicant pipeline, built for dental",
            ]}
            ctaLabel="Explore DSO Hiring"
            href="/for-dsos"
          />
          <DoorwayPanel
            accent="heritage"
            icon={Stethoscope}
            eyebrow="For Dental Professionals"
            title="Find your next dental role"
            body="Browse real openings at verified dental support organizations and apply direct — from hygiene, assisting, and front desk to dentist, specialist, and corporate roles."
            points={[
              "Real roles at verified DSOs — no agency reposts",
              "Apply direct — free for dental professionals, forever",
              "Every employer is a verified DSO — clinical and corporate roles alike",
            ]}
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
  points,
  ctaLabel,
  href,
}: {
  /** "ink" = navy block, "heritage" = green block. Equal weight, distinct identity. */
  accent: "ink" | "heritage";
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  ctaLabel: string;
  href: string;
}) {
  const isInk = accent === "ink";
  return (
    <Link
      href={href}
      className={`group relative flex flex-col p-9 sm:p-10 text-ivory motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 ${
        isInk ? "bg-ink hover:bg-ink-soft" : "bg-heritage hover:bg-heritage-deep"
      }`}
      style={{ boxShadow: "0 26px 50px -26px rgba(7,15,28,0.32)" }}
    >
      <span
        className="inline-flex items-center justify-center w-12 h-12 mb-6 bg-ivory/15 text-ivory"
        aria-hidden
      >
        <Icon className="h-6 w-6" />
      </span>

      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/65 mb-2.5">
        {eyebrow}
      </div>
      <div className="text-[26px] sm:text-[30px] font-extrabold tracking-[-0.7px] leading-tight text-ivory mb-3">
        {title}
      </div>
      <p className="text-[14.5px] text-ivory/75 leading-[1.65] mb-6">{body}</p>

      <ul className="list-none border-t border-ivory/15 pt-5 mb-8">
        {points.map((point) => (
          <li
            key={point}
            className="text-[13.5px] text-ivory/85 py-1.5 flex items-start gap-2.5 leading-snug"
          >
            <Check
              className="h-4 w-4 flex-shrink-0 mt-0.5 text-ivory"
              strokeWidth={3}
              aria-hidden
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      {/* CTA — each card wears the other lens's color so both pop */}
      <span
        className={`mt-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-[12px] font-bold tracking-[2px] uppercase transition-colors ${
          isInk
            ? "bg-heritage text-ivory group-hover:bg-heritage-light"
            : "bg-ink text-ivory group-hover:bg-ink-soft"
        }`}
      >
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
          A job board only works when both sides show up.
        </h2>
        <p className="text-base sm:text-lg text-slate-body leading-[1.7]">
          DSOs need a steady pipeline of dental talent. Dental professionals
          need real openings at employers worth their time. Generic job boards
          serve neither well — so DSO Hire is dental-only on purpose. Every
          employer is a verified dental support organization, the roles run
          from chairside to the corporate teams behind a growing dental group,
          and both sides connect directly. That&apos;s why each audience gets
          its own front door — equal weight, built with the same care.
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
    body: "Not a generic job board with a dental filter. Every employer is a verified dental support organization, and every role — clinical or corporate — sits inside the dental industry. Both sides are pre-qualified before anyone says hello.",
  },
  {
    icon: ArrowLeftRight,
    title: "Direct — no middlemen",
    body: "DSOs and dental professionals connect straight through the platform. No staffing agencies skimming placement fees, no recruiters gatekeeping the pipeline, no resume reselling.",
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
            href="/for-dsos"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            <Building2 className="h-4 w-4" />
            I&apos;m a DSO
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
