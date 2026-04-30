/**
 * /about — founder story and DSO Hire's positioning.
 *
 * Tone: operator-to-operator. First-person from Cameron, not corporate-third.
 * Goal: build trust that the platform is built by someone who actually
 * understands the dental industry, not a generic SaaS shop.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "DSO Hire is built by Cameron Eslinger, a Kansas-based operator with years of dental industry experience. Operator-built, not generic SaaS.",
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
        Built by an operator, not a recruiting platform.
      </h1>
      <p className="text-lg sm:text-xl text-slate-body leading-relaxed">
        DSO Hire is a one-person operation by Cameron Eslinger, working out of
        Kansas. The product was built because the existing options for hiring at
        a multi-location DSO were genuinely bad and nobody else was fixing them.
      </p>
    </section>
  );
}

function Story() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[760px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          The Story
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12">
          How DSO Hire ended up looking like this.
        </h2>

        <div className="space-y-7 text-[16px] sm:text-[17px] text-ink leading-[1.7]">
          <p>
            I&apos;ve spent years in the dental industry — first as an operator,
            then as someone who builds tools for operators. The pattern I kept
            seeing across DSOs of every size was the same: clinical work was
            improving every year, but the back office was stuck on tooling
            designed for solo practices in 2008.
          </p>
          <p>
            Hiring was the most painful version of that gap. Multi-location DSOs
            spend tens of thousands of dollars a year on per-listing fees and
            agency placement charges, then hand the work to recruiters who
            re-enter the same job description into half a dozen platforms. The
            tools were never built for the operating model — they were built for
            individual practices, then bolted onto larger organizations.
          </p>
          <p>
            DSO Hire is the opposite. The product assumes you operate multiple
            locations from day one. One subscription, one team account,
            unlimited postings across every practice, no placement fees ever.
            What sounds like a small change unlocks a different relationship
            with hiring — you start posting routine roles you would have skipped
            because the per-listing math didn&apos;t pencil.
          </p>
          <p>
            Right now I write the code, answer the email, and do the customer
            onboarding personally. That&apos;s by design. The first 5 customers
            (the &quot;Founding&quot; tier) get a direct line to me, a 12-month
            rate lock, and proportional input on what we build next. In exchange
            we get testimonials we can use to recruit customer 6 onward.
          </p>
          <p>
            If that&apos;s the kind of vendor relationship that fits how you
            run your DSO, I&apos;d like to talk.
          </p>
          <p className="pt-2 text-slate-body italic">— Cameron Eslinger</p>
        </div>
      </div>
    </section>
  );
}

const PRINCIPLES = [
  {
    eyebrow: "Operator-built",
    title: "Decisions get made by someone who has actually hired in this industry.",
    body: "Every product choice runs through the question: would a real DSO recruiter pick this up and use it tomorrow without a 30-minute training session?",
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
    eyebrow: "Slow software, on purpose",
    title: "We ship deliberately. The product gets stable, then it gets bigger.",
    body: "The dental industry has been burned by VC-backed platforms that sprinted, raised, and disappeared. DSO Hire is bootstrapped and intentionally small. The trade-off: features take a little longer; the platform is around in five years.",
  },
];

function Principles() {
  return (
    <section className="px-6 sm:px-14 py-28 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        How We Operate
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
          Built in Kansas. Hiring DSOs nationwide.
        </h2>
        <p className="text-base text-ivory/70 leading-[1.7] mb-9">
          DSO Hire LLC is registered in Kansas. The product runs on Vercel,
          Supabase, and Stripe. All infrastructure is US-hosted.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="mailto:cam@dsohire.com"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-heritage text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Email Cameron
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
