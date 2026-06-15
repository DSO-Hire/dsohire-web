/**
 * /switch — #115 FOH-6: the migration-promise page.
 *
 * For the HR manager with three years of history in her current ATS, the
 * scariest part of buying DSO Hire is the move. This page kills that fear
 * with a concrete promise (we do the lift, free) and an honest scope of
 * what migrates (we work from your current system's exports — no system
 * is named, per the de-naming rule on public copy).
 */

import Link from "next/link";
import { ArrowRight, Check, Inbox, Upload, Users } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Switch to DSO Hire — Free White-Glove Migration",
  description:
    "Moving from another ATS or job board? We migrate your open jobs, templates, screening setup, and team for you — free, typically within days. Run both systems in parallel until you're confident.",
};

const STEPS = [
  {
    n: "01",
    title: "Export, or just give us access to your exports",
    body: "Every major ATS and job board can export jobs, templates, and team setups as CSV or spreadsheets. Send us what your current system gives you — messy is fine, that's our problem.",
  },
  {
    n: "02",
    title: "We rebuild your hiring world inside DSO Hire",
    body: "Open jobs re-created across the right locations, screening questions attached, email and offer-letter templates rebuilt, your team invited with the right roles and location scopes.",
  },
  {
    n: "03",
    title: "Run both in parallel until you're sure",
    body: "Keep your old system live while you take your first applications through DSO Hire. Cancel the old contract when you're confident — not before. No lock-in on our side either: your data exports from Settings any time.",
  },
];

const MIGRATES = [
  "Open job postings — across every location, re-created in one flow",
  "Screening questions (or pick from our 130+ dental library)",
  "Offer-letter + email templates (rebuilt to match your tier's template set)",
  "Team members, roles, and per-location scopes",
];

export default function SwitchPage() {
  return (
    <SiteShell ctaIntent="dso">
      <section className="pt-[140px] pb-14 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Switching To DSO Hire
        </div>
        <h1
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5 max-w-[860px]"
        >
          We move you in. <em className="not-italic text-heritage-light">Free.</em>
        </h1>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-lg text-slate-body leading-[1.7] max-w-[640px]"
        >
          The worst part of leaving an ATS is the move. So we do it for you —
          jobs, screening setup, templates, and your whole team with the
          right roles. White-glove, included on every tier, typically done
          in days.
        </p>
      </section>

      {/* Steps */}
      <section className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              data-reveal
              style={{ "--mk-delay": `${i * 90}ms` } as React.CSSProperties}
              className="bg-white p-8"
            >
              <div className="text-[28px] font-extrabold tracking-[-1px] text-heritage/40 mb-3">
                {s.n}
              </div>
              <h2 className="text-[17px] font-extrabold tracking-[-0.4px] leading-tight text-ink mb-2.5">
                {s.title}
              </h2>
              <p className="text-[14px] text-slate-body leading-[1.65]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What migrates */}
      <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-20">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div data-reveal>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] text-ink mb-5 max-w-[480px]">
              What comes with you
            </h2>
            <ul className="list-none space-y-3">
              {MIGRATES.map((m) => (
                <li key={m} className="flex items-start gap-3 text-[15px] text-slate-body leading-relaxed">
                  <Check className="h-4 w-4 text-heritage-deep shrink-0 mt-1" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal style={{ "--mk-delay": "90ms" } as React.CSSProperties}>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] text-ink mb-5 max-w-[480px]">
              The honest scope
            </h2>
            <p className="text-[15px] text-slate-body leading-[1.7] mb-4">
              We work from what your current system exports, and we&apos;ll
              tell you exactly what made it over — itemized, before you
              cancel anything. One thing no ATS migration can honestly
              promise: past candidates as living profiles. Candidates here
              are real accounts that people own, not rows we copy — so your
              old applicant list stays with you as your export, and your
              pipeline refills through your live postings from day one.
            </p>
            <p className="text-[15px] text-slate-body leading-[1.7]">
              And the door swings both ways: if DSO Hire ever isn&apos;t the
              right fit, your full data exports from Settings without a
              support ticket. We&apos;d rather earn the renewal than lock the
              exit.
            </p>
          </div>
        </div>
      </section>

      {/* Why switch — quick contrast row */}
      <section className="px-6 sm:px-14 py-20 max-w-[1240px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {[
            {
              icon: Upload,
              title: "From per-listing job boards",
              body: "Stop paying per posting, per location. One flat fee covers every practice you operate — and you get a real pipeline, not an inbox.",
            },
            {
              icon: Users,
              title: "From staffing agencies",
              body: "Keep agencies for the searches that truly need them. Stop paying 15–25% for the hygienist your office manager found herself.",
            },
            {
              icon: Inbox,
              title: "From spreadsheets + email",
              body: "If your 'ATS' is a shared inbox and a spreadsheet, you'll feel this in week one: one pipeline, every location, nothing lost.",
            },
          ].map((c, i) => (
            <div
              key={c.title}
              data-reveal
              style={{ "--mk-delay": `${i * 90}ms` } as React.CSSProperties}
              className="bg-white p-8"
            >
              <span
                className="inline-flex items-center justify-center w-10 h-10 mb-5 text-heritage-deep"
                style={{ background: "var(--heritage-tint)" }}
                aria-hidden
              >
                <c.icon className="h-5 w-5" />
              </span>
              <h3 className="text-[16px] font-extrabold tracking-[-0.3px] leading-tight text-ink mb-2">
                {c.title}
              </h3>
              <p className="text-[13.5px] text-slate-body leading-[1.6]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink text-ivory px-6 sm:px-14 py-20">
        <div className="max-w-[820px] mx-auto text-center">
          <h2 data-reveal className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] mb-4">
            Tell us what you&apos;re moving from.
          </h2>
          <p
            data-reveal
            style={{ "--mk-delay": "70ms" } as React.CSSProperties}
            className="text-base text-ivory/65 leading-[1.7] max-w-[520px] mx-auto mb-9"
          >
            One conversation and we&apos;ll scope the whole move — what
            exports, what we rebuild, and how long it takes. Usually: days.
          </p>
          <div
            data-reveal
            style={{ "--mk-delay": "140ms" } as React.CSSProperties}
            className="flex flex-col sm:flex-row gap-3.5 justify-center"
          >
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
            >
              Scope My Migration
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-9 py-4 border border-ivory/30 text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:border-ivory hover:bg-white/5 transition-colors"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
