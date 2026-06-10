/**
 * /resume-templates — #87c.2 public SEO landing.
 *
 * The cold-start funnel (ties #85): ranks for "free dental résumé template"
 * intent, shows the six real templates rendered from sample data, and converts
 * to a candidate sign-up → build flow. Server component, indexable (the global
 * pre-launch lockdown handles noindex until go-live). No auth, no AI — the
 * previews are the same deterministic ResumeDocument used in-app.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { ResumeDocument } from "@/components/resume/resume-document";
import type { ResumeData } from "@/lib/resume/resume-format";
import { RESUME_TEMPLATE_LIST } from "@/lib/resume/resume-templates";

export const metadata: Metadata = {
  title: "Free Dental Résumé Templates (ATS-Friendly) | DSO Hire",
  description:
    "Build a free, ATS-safe dental résumé in minutes. Six clean templates designed for hygienists, assistants, front desk, dentists, and DSO leaders — download as a PDF, no sign-up tricks.",
  alternates: { canonical: "https://dsohire.com/resume-templates" },
  openGraph: {
    title: "Free Dental Résumé Templates (ATS-Friendly)",
    description:
      "Six clean, ATS-safe résumé templates built for dental professionals. Free to build and download.",
    url: "https://dsohire.com/resume-templates",
    type: "website",
  },
};

// Sample data for the previews — a realistic dental hygienist.
const SAMPLE: ResumeData = {
  name: "Jordan Avery, RDH",
  headline: "Registered Dental Hygienist · 7 years",
  summary:
    "Patient-focused hygienist with 7 years in high-volume group practices. Known for gentle perio care, strong case acceptance, and mentoring new assistants. Fluent in Dentrix and Open Dental.",
  phone: "(555) 240-1180",
  email: "jordan.avery@email.com",
  city: "Kansas City",
  state: "MO",
  linkedinUrl: "linkedin.com/in/jordanavery",
  yearsExperience: 7,
  desiredRoles: [],
  specialties: [],
  skills: [
    "Scaling & root planing",
    "Periodontal charting",
    "Local anesthesia",
    "Patient education",
    "Intraoral imaging",
    "Invisalign scanning",
  ],
  languages: ["English", "Spanish"],
  pmsSystems: ["Dentrix", "Open Dental"],
  work: [
    {
      id: "w1",
      title: "Lead Dental Hygienist",
      company: "Riverside Dental Group",
      isDso: true,
      start: "2021-02-01",
      end: null,
      isCurrent: true,
      description:
        "Manage hygiene schedule across two locations; introduced a perio re-care protocol that lifted recall compliance 18%. Mentor three hygiene assistants.",
    },
    {
      id: "w2",
      title: "Dental Hygienist",
      company: "Summit Family Dentistry",
      isDso: false,
      start: "2018-06-01",
      end: "2021-01-01",
      isCurrent: false,
      description:
        "Full-scope hygiene care in a busy family practice; consistently top quadrant in case acceptance and same-day treatment.",
    },
  ],
  education: [
    {
      id: "e1",
      school: "University of Missouri–Kansas City",
      degree: "Associate of Applied Science",
      field: "Dental Hygiene",
      startYear: 2016,
      endYear: 2018,
      description: null,
    },
  ],
  licenses: [
    {
      id: "l1",
      type: "rdh",
      state: "MO",
      number: null,
      displayNumber: false,
      expires: "2027-03-01",
    },
  ],
  certifications: [
    { id: "c1", kind: "cpr_bls", level: null, expires: "2026-09-01" },
    { id: "c2", kind: "local_anesthesia", level: null, expires: null },
  ],
  customSections: [],
  sectionOrder: [],
};

export default function ResumeTemplatesLanding() {
  return (
    <SiteShell>
      {/* Hero */}
      <section className="border-b border-[var(--rule)] bg-ivory">
        <div className="mx-auto max-w-[1080px] px-6 py-16 sm:py-20 text-center">
          <div className="text-[11px] font-bold uppercase tracking-[3px] text-heritage-deep mb-3">
            Free for dental professionals
          </div>
          <h1 className="mx-auto max-w-[820px] text-4xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
            Free dental résumé templates.
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-relaxed text-slate-body">
            Six clean, ATS-safe templates built for hygienists, assistants,
            front desk, dentists, and DSO leaders. Fill it once, switch styles
            with one click, and download a polished PDF — no design skills, no
            catch.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/candidate/sign-up"
              className="inline-flex items-center gap-2 bg-ink px-6 py-3 text-[13px] font-bold uppercase tracking-[1.5px] text-ivory hover:bg-ink-soft transition-colors"
            >
              Build mine free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-[1.5px] text-heritage-deep hover:text-ink transition-colors"
            >
              Browse dental jobs
            </Link>
          </div>
          <ul className="mx-auto mt-8 flex max-w-[760px] flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-slate-body">
            {[
              "ATS-friendly (passes the résumé scanners)",
              "Built from your profile — no retyping",
              "Download as PDF, use anywhere",
            ].map((b) => (
              <li key={b} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-heritage-deep" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Template gallery */}
      <section className="mx-auto max-w-[1180px] px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.6px] text-ink text-center">
          Pick a style. Switch any time.
        </h2>
        <p className="mx-auto mt-3 max-w-[600px] text-center text-[14px] text-slate-body">
          Every template is single-column and parser-safe, so a beautiful résumé
          never costs you the interview. Your content stays the same — only the
          look changes.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {RESUME_TEMPLATE_LIST.map((tpl) => (
            <div key={tpl.id} className="mx-auto w-[300px]">
              {/* Scaled, non-interactive thumbnail of the real template */}
              <div className="h-[388px] w-[300px] overflow-hidden rounded-t-lg border border-[var(--rule)] bg-white shadow-sm">
                <div
                  className="pointer-events-none"
                  style={{
                    width: 760,
                    transform: "scale(0.3947)",
                    transformOrigin: "top left",
                  }}
                >
                  <ResumeDocument data={SAMPLE} template={tpl.id} />
                </div>
              </div>
              <div className="rounded-b-lg border border-t-0 border-[var(--rule)] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-ink">{tpl.name}</h3>
                  <Link
                    href="/candidate/sign-up"
                    className="shrink-0 text-[12px] font-bold uppercase tracking-[1px] text-heritage-deep hover:text-ink"
                  >
                    Use this →
                  </Link>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-slate-body">
                  {tpl.blurb}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why / trust */}
      <section className="border-t border-[var(--rule)] bg-cream/40">
        <div className="mx-auto max-w-[920px] px-6 py-16">
          <h2 className="text-2xl font-bold tracking-[-0.4px] text-ink text-center">
            Made for dental — and for the robots that read your résumé first.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                t: "Speaks dental",
                d: "Sections for licenses, certifications, PMS systems, and specialties — the things a dental employer actually scans for.",
              },
              {
                t: "ATS-safe by design",
                d: "Single column, real text, standard headings, web-safe fonts. No sidebars or graphics that scramble in a parser.",
              },
              {
                t: "One profile, many uses",
                d: "Build once on DSO Hire, then auto-fill applications here and export a PDF to apply anywhere else.",
              },
            ].map((c) => (
              <div key={c.t}>
                <h3 className="text-[15px] font-bold text-ink">{c.t}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-body">
                  {c.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-ink">
        <div className="mx-auto max-w-[820px] px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.6px] text-ivory">
            Your dental résumé, done in minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-ivory/80">
            Create a free DSO Hire profile, build your résumé, and apply to
            multi-location dental groups — all in one place.
          </p>
          <div className="mt-8">
            <Link
              href="/candidate/sign-up"
              className="inline-flex items-center gap-2 bg-ivory px-6 py-3 text-[13px] font-bold uppercase tracking-[1.5px] text-ink hover:bg-cream transition-colors"
            >
              Build mine free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* SEO structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Free Dental Résumé Templates",
            description:
              "Six free, ATS-friendly résumé templates for dental professionals.",
            url: "https://dsohire.com/resume-templates",
            isPartOf: { "@type": "WebSite", name: "DSO Hire", url: "https://dsohire.com" },
          }),
        }}
      />
    </SiteShell>
  );
}
