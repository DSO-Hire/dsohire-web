/**
 * /practicefit — the dedicated home for the proprietary fit engine
 * (#115 FOH, Cam ask Day 31: "our wow feature gets its own display").
 *
 * One page, both products: PracticeFit™ (clinical + practice-side) and
 * DSOFit™ (corporate/HQ-side) — two tranches of one engine. Linked from
 * the top nav (the PF wordmark replaced "Companies"), so this page serves
 * BOTH audiences and ends in a dual CTA.
 *
 * Claims policy: everything here states shipped behavior only, and the
 * honesty band restates the locked compliance floors (score-never-gate,
 * no auto-screening, thin profiles never punished). Keep it that way.
 */

import Link from "next/link";
import { ArrowRight, Building2, Stethoscope } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { FitDial } from "@/components/marketing/fit-dial";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import { candidateCtaHref } from "@/lib/marketing/candidate-cta";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PracticeFit™ & DSOFit™ — The Dental Fit Score",
  description:
    "PracticeFit is the proprietary two-sided fit model built only for dentistry: a five-minute assessment scores every candidate against every opening on schedule, pace, culture, PMS fluency, commute, and more. DSOFit does the same for corporate DSO roles. A score, never a gate — it informs decisions, it never makes them.",
  keywords: [
    "PracticeFit",
    "DSOFit",
    "dental job matching",
    "dental candidate matching",
    "dental hiring fit score",
    "dental ATS matching",
  ],
};

export default async function PracticeFitPage() {
  // Auth-aware: a signed-in candidate taking their PracticeFit goes straight to
  // the assessment, not the sign-up page (Cam, Day 37).
  const assessmentHref = await candidateCtaHref("assessment");
  return (
    <SiteShell>
      <Hero ctaHref={assessmentHref} />
      <TwoSides />
      <WhatItScores />
      <DsoFitBand />
      <HonestyBand />
      <FinalCta ctaHref={assessmentHref} />
    </SiteShell>
  );
}

/* ───────── Hero ───────── */

function Hero({ ctaHref }: { ctaHref: string }) {
  return (
    <section className="relative overflow-hidden pt-[140px] pb-24 px-6 sm:px-14">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse at 35% 35%, #000 0%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at 35% 35%, #000 0%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-20 items-center">
        <div>
          <div data-reveal className="mb-6">
            <PracticeFitWordmark surface="light" tm className="text-[34px] sm:text-[40px]" />
          </div>
          <h1
            data-reveal
            style={{ "--mk-delay": "70ms" } as React.CSSProperties}
            className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-6 max-w-[640px]"
          >
            The fit score built{" "}
            <em className="not-italic text-heritage-light">only for dentistry.</em>
          </h1>
          <p
            data-reveal
            style={{ "--mk-delay": "140ms" } as React.CSSProperties}
            className="text-lg text-slate-body leading-[1.7] max-w-[560px] mb-9"
          >
            A five-minute, two-sided assessment — then every candidate and
            every opening get scored against each other on the things that
            actually decide whether a hire works out in a dental practice:
            schedule, pace, culture, mentorship, PMS fluency, commute,
            licensure. Not keywords. Fit.
          </p>
          <div
            data-reveal
            style={{ "--mk-delay": "200ms" } as React.CSSProperties}
            className="flex flex-wrap items-center gap-3.5"
          >
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-heritage text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
            >
              <Stethoscope className="h-4 w-4" />
              Take Your PracticeFit
            </Link>
            <Link
              href="/for-dental-groups"
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors"
            >
              <Building2 className="h-4 w-4" />
              See It On Your Openings
            </Link>
          </div>
        </div>

        {/* The score, assembling itself — framed as the real product card. */}
        <div data-reveal style={{ "--mk-delay": "220ms" } as React.CSSProperties}>
          <div
            className="bg-card border border-[var(--rule-strong)] overflow-hidden"
            style={{
              boxShadow:
                "0 30px 60px -30px rgba(7,15,28,0.18), 0 10px 24px -12px rgba(7,15,28,0.10)",
            }}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 bg-cream border-b border-[var(--rule)]">
              <div className="min-w-0">
                <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
                  Your Fit · Hygienist
                </div>
                <div className="text-[16px] font-bold tracking-[-0.3px] text-ink leading-tight">
                  Greenfield Dental Group
                </div>
                <div className="text-[12px] text-slate-body mt-0.5">
                  Westerville, OH · 4-day week · Posted pay range
                </div>
              </div>
              <span
                className="shrink-0 px-2 py-1 text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep border border-heritage/35"
                style={{ background: "var(--heritage-tint)" }}
              >
                Strong Match
              </span>
            </div>
            <div className="px-6 sm:px-8 py-8">
              <FitDial
                score={92}
                caption="Strong match"
                dimensions={[
                  { label: "Schedule fit", value: 94 },
                  { label: "Pace & culture", value: 88 },
                  { label: "Growth & mentorship", value: 91 },
                  { label: "Commute", value: 86 },
                ]}
              />
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] bg-cream/50 text-[12.5px] text-slate-body leading-relaxed">
              <strong className="text-heritage-deep font-bold">Why this match:</strong>{" "}
              your 4-day week lines up · mentorship-forward team · 12-minute
              commute from your preferred area.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Two sides, one score ───────── */

function TwoSides() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Two Sides, One Score
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-12"
        >
          Candidates get honest expectations. Practices get ranked pipelines.
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <div data-reveal className="bg-card p-9">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
              If you&apos;re a dental professional
            </div>
            <p className="text-[15px] text-slate-body leading-[1.7] mb-4">
              Take the assessment once — your pace, your schedule, how you
              like to be mentored, what matters most to you. Every opening on
              the board gets a score against it, with a plain-English
              &ldquo;why this match&rdquo; so you know what a practice is
              actually like before you apply.
            </p>
            <p className="text-[15px] text-slate-body leading-[1.7]">
              It&apos;s free, it&apos;s private, and your current office never
              sees you browsing.
            </p>
          </div>
          <div
            data-reveal
            style={{ "--mk-delay": "90ms" } as React.CSSProperties}
            className="bg-card p-9"
          >
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
              If you&apos;re hiring for a dental group
            </div>
            <p className="text-[15px] text-slate-body leading-[1.7] mb-4">
              Every applicant lands in your pipeline already scored against
              the role — schedule overlap, PMS fluency, clinical mix, commute,
              licensure. Smart Picks surface the strongest fits per job, and
              your dashboard rolls up today&apos;s top fits across every
              opening you have open.
            </p>
            <p className="text-[15px] text-slate-body leading-[1.7]">
              Your team starts with the best-fit candidates instead of a
              chronological stack of résumés.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── What it scores ───────── */

const CLINICAL_DIMS = [
  "Schedule overlap (days, evenings, weekends)",
  "Real commute distance to the practice",
  "PMS fluency (Dentrix, Eaglesoft, Open Dental…)",
  "State licensure + certifications",
  "Specialty + clinical mix",
  "Work pace + autonomy",
  "Mentorship + CE growth",
  "Practice culture + what matters most to them",
];

const CORPORATE_DIMS = [
  "Seniority + authority level",
  "Multi-site / org scale experience",
  "Dental-domain depth",
  "Leadership scope (direct + indirect reports)",
  "Work mode (onsite, hybrid, remote)",
  "Function fit across 16 corporate functions",
];

function WhatItScores() {
  return (
    <section className="px-6 sm:px-14 py-24 max-w-[1240px] mx-auto">
      <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Under The Hood
      </div>
      <h2
        data-reveal
        style={{ "--mk-delay": "70ms" } as React.CSSProperties}
        className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12"
      >
        Scored on what actually predicts a good hire.
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div data-reveal>
          <div className="mb-4">
            <PracticeFitWordmark surface="light" tm className="text-[20px]" />
            <span className="block text-[12px] text-slate-meta mt-1 tracking-[0.4px]">
              Clinical + practice-side roles
            </span>
          </div>
          <ul className="list-none border-t border-[var(--rule)]">
            {CLINICAL_DIMS.map((d) => (
              <li
                key={d}
                className="py-3 border-b border-[var(--rule)] text-[14.5px] text-slate-body flex items-center gap-3"
              >
                <span className="block w-1.5 h-1.5 bg-heritage rounded-full shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div data-reveal style={{ "--mk-delay": "90ms" } as React.CSSProperties}>
          <div className="mb-4">
            <DsoFitWordmark surface="light" tm className="text-[20px]" />
            <span className="block text-[12px] text-slate-meta mt-1 tracking-[0.4px]">
              Corporate + DSO HQ roles
            </span>
          </div>
          <ul className="list-none border-t border-[var(--rule)]">
            {CORPORATE_DIMS.map((d) => (
              <li
                key={d}
                className="py-3 border-b border-[var(--rule)] text-[14.5px] text-slate-body flex items-center gap-3"
              >
                <span className="block w-1.5 h-1.5 bg-heritage-deep rounded-full shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────── DSOFit band ───────── */

function DsoFitBand() {
  return (
    <section className="bg-card border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div data-reveal className="mb-5">
          <DsoFitWordmark surface="light" tm className="text-[30px]" />
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-6"
        >
          The corporate half. Because DSOs don&apos;t just hire chairside.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-base text-slate-body leading-[1.7] max-w-[680px] mb-8"
        >
          Finance, operations, marketing, HR, IT, legal — a growing group
          hires a back office, and no general ATS understands what a
          dental-fluent CFO looks like. DSOFit scores corporate candidates on
          seniority, multi-site scale, dental-domain depth, and leadership
          scope — and it understands the clinician-to-executive bridge, so a
          DDS stepping into a Chief Clinical Officer search is scored on
          intent, not pigeonholed by degree. Pair it with a confidential
          search to keep an executive replacement visible only to the people
          on it.
        </p>
        <Link
          data-reveal
          style={{ "--mk-delay": "200ms" } as React.CSSProperties}
          href="/for-corporate"
          className="inline-flex items-center gap-2.5 px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:border-ink hover:bg-cream transition-colors"
        >
          Explore Corporate Roles
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ───────── Honesty band — the locked compliance floors, as copy ───────── */

const PRINCIPLES = [
  {
    title: "A score, never a gate",
    body: "Fit informs decisions — it never makes them. No candidate is auto-screened, auto-rejected, or hidden because of a score, on either side.",
  },
  {
    title: "Thin profiles aren't punished",
    body: "We score honestly on the signals that exist and say so when coverage is thin — a new profile reads \"not enough signal yet,\" never \"bad fit.\"",
  },
  {
    title: "No unearned extrapolation",
    body: "We never assume a fit a candidate hasn't signaled. The score is built from what you told us and what the job actually requires — nothing inferred from age, school year, or anything close to a protected category.",
  },
  {
    title: "You can always see why",
    body: "Every score ships with its reasons in plain English. If a number can't explain itself, it doesn't belong in a hiring decision.",
  },
];

function HonestyBand() {
  return (
    <section className="bg-hero text-hero-foreground px-6 sm:px-14 py-24 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          right: "-12%",
          width: "560px",
          height: "560px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,122,96,0.12), transparent 65%)",
          transform: "translateY(-50%)",
        }}
      />
      <div className="relative max-w-[1240px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-light mb-3.5">
          How We Keep It Honest
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-hero-foreground max-w-[720px] mb-12"
        >
          Four rules the score can never break.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-hero-foreground/10 border border-hero-foreground/10">
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.title}
              data-reveal
              style={{ "--mk-delay": `${i * 70}ms` } as React.CSSProperties}
              className="bg-hero p-8"
            >
              <h3 className="text-[18px] font-extrabold tracking-[-0.4px] text-hero-foreground mb-2.5">
                {p.title}
              </h3>
              <p className="text-[14.5px] text-hero-foreground/70 leading-[1.65]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Final CTA ───────── */

function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <section className="px-6 sm:px-14 py-24">
      <div className="max-w-[820px] mx-auto text-center">
        <h2
          data-reveal
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.08] text-ink mb-4"
        >
          See your fit.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-base text-slate-body leading-[1.7] max-w-[540px] mx-auto mb-10"
        >
          Five minutes for candidates. Zero setup for dental groups — it&apos;s
          on, on every tier, from the first applicant.
        </p>
        <div
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="flex flex-col sm:flex-row gap-3.5 justify-center"
        >
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-heritage text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            <Stethoscope className="h-4 w-4" />
            Take Your PracticeFit
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Get It For Your Group
          </Link>
        </div>
      </div>
    </section>
  );
}
