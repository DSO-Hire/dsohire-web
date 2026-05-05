/**
 * /about — DSO Hire's positioning and operating principles.
 *
 * Tone: company-voice, operator-led. Talks about the product and the
 * incentive alignment, not the founder. Anonymized per the launch policy
 * (see feedback_anonymize_public_copy in product memory).
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "DSO Hire is the job board built specifically for multi-location dental support organizations. Operator-led, dental-focused, no placement fees ever.",
};

export default function AboutPage() {
  return (
    <SiteShell>
      <Hero />
      <Story />
      <Principles />
      <FinalCta />
    </SiteShell>
  );
}

function Hero() {
  return (
    <section className="pt-[140px] pb-16 px-6 sm:px-14 max-w-[920px] mx-auto">
      <div className="flex items-center gap-3.5 mb-8">
        <span className="block w-7 h-px bg-heritage" />
        <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
          About DSO Hire
        </span>
      </div>
      <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-7">
        Built by operators, for operators.
      </h1>
      <p className="text-lg sm:text-xl text-slate-body leading-relaxed">
        DSO Hire is the job board purpose-built for multi-location dental
        support organizations. Every product decision starts from one question:
        does this make a real DSO recruiter&apos;s day shorter, or does it just
        add another tool to learn?
      </p>
    </section>
  );
}

function Story() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[760px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Why DSO Hire exists
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12">
          The hiring stack the industry needed never got built.
        </h2>

        <div className="space-y-7 text-[16px] sm:text-[17px] text-ink leading-[1.7]">
          <p>
            Across DSOs of every size, the pattern is the same. Clinical work
            has gotten better every year. The back office has stayed stuck on
            tooling designed for solo practices.
          </p>
          <p>
            Hiring is the most expensive version of that gap. Multi-location
            DSOs spend tens of thousands a year on per-listing fees and agency
            placement charges, then hand the work to recruiters who re-enter
            the same job description into half a dozen platforms. The tools
            were never built for the operating model — they were built for
            individual practices, then bolted onto larger organizations.
          </p>
          <p>
            DSO Hire is the opposite. The product assumes you operate multiple
            locations from day one. One subscription, one team account,
            unlimited postings across every practice, no placement fees ever.
            What sounds like a small change unlocks a different relationship
            with hiring — DSOs start posting routine roles they would have
            skipped because the per-listing math didn&apos;t pencil.
          </p>
          <p>
            If that&apos;s the kind of vendor relationship that fits how you
            run your DSO, we&apos;d like to talk.
          </p>
        </div>
      </div>
    </section>
  );
}

const PRINCIPLES = [
  {
    eyebrow: "Operator-led",
    title: "Decisions get made by people who have actually hired in this industry.",
    body: "Every product choice runs through one filter: would a real DSO recruiter pick this up and use it tomorrow without a 30-minute training session? If the answer is no, we keep iterating.",
  },
  {
    eyebrow: "No placement fees",
    title: "Our incentive is your retention, not your hiring volume.",
    body: "We don't get paid more when you hire more. The flat subscription means we win when you stay, which means we build for renewals — quality, reliability, support — not for transactions.",
  },
  {
    eyebrow: "Privacy by default",
    title: "Candidates own their resumes. DSOs own their pipeline data.",
    body: "We don't sell candidate data. We don't broker candidates to recruiters who didn't post the job. The platform exists to deliver applications to the DSO that posted, full stop.",
  },
  {
    eyebrow: "Built to last",
    title: "The platform you sign with today is the platform you'll have in five years.",
    body: "The dental industry has been burned by VC-backed platforms that sprinted, raised, and disappeared. DSO Hire is independent and dental-only — no pivot pressure, no acquisition fire-sale, no quarterly growth math forcing a roadmap to chase whatever's hot. Multi-location DSO hiring is the entire mission, and the platform is built to still be running it five years from now.",
  },
];

function Principles() {
  return (
    <section className="px-6 sm:px-14 py-28 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        How we operate
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12">
        Four principles we won&apos;t compromise on.
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {PRINCIPLES.map((p, i) => (
          <div key={i} className="bg-white p-10">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
              {p.eyebrow}
            </div>
            <div className="text-[20px] font-extrabold tracking-[-0.5px] leading-tight text-ink mb-3">
              {p.title}
            </div>
            <p className="text-[14px] text-slate-body leading-[1.65]">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-ink text-ivory px-6 sm:px-14 py-24 text-center">
      <div className="max-w-[680px] mx-auto">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ivory mb-5">
          Hiring DSOs nationwide.
        </h2>
        <p className="text-base text-ivory/70 leading-[1.7] mb-9">
          DSO Hire is a US-hosted, US-operated platform. Every job posting
          comes from a verified dental support organization — not a recruiter,
          staffing agency, or solo practice.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-heritage text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Contact Us
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center px-9 py-[15px] border border-white/20 text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:border-ivory transition-colors"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
