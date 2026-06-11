/**
 * /about — the founder story (Day 32 port, FOH 100x Model 02 v2).
 *
 * Voice: Direction C, "The Industry Insider" — Cam's pick. Founder is named
 * (Cam Eslinger — name use approved by Cam, Day 32; supersedes the older
 * anonymize-public-copy posture for THIS page) but the framing holds the
 * locked disclosure line: "ten years on the business side of dentistry,"
 * never the firm, never "operator," never buy-side/advisory language.
 * See memory: user_cam_founder_profile_corrected.
 *
 * Structure: letter + photo sidebar → timeline → "What we will never do"
 * promises band (claims map 1:1 to real architecture) → navy closing with
 * the ivory signature. Assets: public/about/founder.jpg + signature*.png
 * (processed from Brand Assets, Day 32).
 */

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "DSO Hire is the dental hiring platform built specifically for multi-location dental groups (DSOs). Born from ten years inside the business of dentistry. Dental-only, no placement fees ever.",
};

export default function AboutPage() {
  return (
    <SiteShell>
      <Hero />
      <FounderLetter />
      <Timeline />
      <Promises />
      <FinalCta />
    </SiteShell>
  );
}

/* ═══════════════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="pt-[140px] pb-12 px-6 sm:px-14 max-w-[1080px] mx-auto">
      <div data-reveal className="flex items-center gap-3.5 mb-8">
        <span className="block w-7 h-px bg-heritage" />
        <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
          About DSO Hire
        </span>
      </div>
      <h1
        data-reveal
        style={{ "--mk-delay": "70ms" } as React.CSSProperties}
        className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-7 max-w-[820px]"
      >
        Dentistry professionalized everything —{" "}
        <em className="not-italic text-heritage-light">except hiring.</em>
      </h1>
      <p
        data-reveal
        style={{ "--mk-delay": "140ms" } as React.CSSProperties}
        className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[640px]"
      >
        Operations, finance, clinical systems: all transformed in a decade.
        The way the industry hires is still post, pray, or pay an agency.
        DSO Hire is the missing piece.
      </p>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   THE LETTER + PHOTO SIDEBAR
═══════════════════════════════════════════════════════ */

function FounderLetter() {
  return (
    <section className="px-6 sm:px-14 pb-24 max-w-[1080px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12 lg:gap-14 items-start">
        {/* the letter */}
        <div
          data-reveal
          className="bg-cream border border-[var(--rule-strong)] border-t-[3px] border-t-heritage px-7 py-10 sm:px-14 sm:py-13 shadow-[0_30px_60px_-40px_rgba(20,35,63,0.3)]"
        >
          <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">
            A letter from the founder
          </div>
          <p className="text-[19px] font-extrabold tracking-[-0.3px] leading-[1.4] text-ink mb-6">
            Ten years on the business side of dentistry. One conclusion.
          </p>
          <div className="space-y-4.5 text-[15px] text-ink leading-[1.85]">
            <p>
              For the past decade I&rsquo;ve worked with dentists and dental
              organizations across the country — through growth, through
              transitions, through every kind of hiring crunch. I grew up
              around this industry — around the people who practice it and the
              people who run it — and I&rsquo;ve spent my career inside its
              business.
            </p>
            <p>
              From the inside, the pattern is impossible to miss: dentistry
              has professionalized{" "}
              <strong className="text-heritage-deep">
                everything except the way it hires
              </strong>
              . Operations, finance, clinical systems — transformed. Hiring is
              still 2005: post on a board, pray, or pay an agency{" "}
              <strong className="text-heritage-deep">$30,000 a head</strong>.
            </p>
            <p>
              DSO Hire is the missing piece, built properly.{" "}
              <strong className="text-heritage-deep">PracticeFit</strong>{" "}
              matches on what actually predicts retention — pace, schedule,
              mentorship, culture — and around it sits a real hiring operating
              system: pipelines, automations, offers, analytics. One flat fee.
              No middlemen.
            </p>
            <p>
              The rules we run it by are listed below. They&rsquo;re not
              marketing — they&rsquo;re the reasons this exists.
            </p>
          </div>

          {/* sign-off */}
          <div className="mt-8">
            <Image
              src="/about/signature.png"
              alt=""
              aria-hidden
              width={176}
              height={56}
              className="-rotate-2 select-none"
            />
            <div className="mt-3 text-[10px] font-bold tracking-[1.8px] uppercase text-slate-meta">
              Cam Eslinger · Founder, DSO Hire
            </div>
          </div>

          <p className="mt-7 pt-4 border-t border-dashed border-[var(--rule-strong)] text-[13px] text-slate-body leading-[1.7]">
            P.S. — If you&rsquo;re a candidate: it&rsquo;s free, forever, and
            your current office can&rsquo;t see you here. That part is
            non-negotiable.
          </p>
        </div>

        {/* sidebar */}
        <aside className="flex flex-col gap-7">
          <div data-reveal style={{ "--mk-delay": "100ms" } as React.CSSProperties}>
            <Image
              src="/about/founder.jpg"
              alt="Cam Eslinger, founder of DSO Hire"
              width={1200}
              height={1500}
              className="w-full h-auto border border-[var(--rule-strong)]"
              priority={false}
            />
          </div>
          <SideFact n="10" label="Years in the dental industry" delay={160} />
          <SideFact n="$0" label="Placement fees, ever" delay={220} />
          <SideFact n="12" label="PracticeFit dimensions scoring real compatibility" delay={280} />
        </aside>
      </div>
    </section>
  );
}

function SideFact({ n, label, delay }: { n: string; label: string; delay: number }) {
  return (
    <div
      data-reveal
      style={{ "--mk-delay": `${delay}ms` } as React.CSSProperties}
      className="border-l-2 border-heritage pl-4.5 py-1"
    >
      <div className="text-[30px] font-extrabold tracking-[-1px] leading-none text-ink tabular-nums">
        {n}
      </div>
      <div className="mt-1.5 text-[10px] font-bold tracking-[1.4px] uppercase text-slate-meta leading-[1.5]">
        {label}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TIMELINE
═══════════════════════════════════════════════════════ */

const TIMELINE: Array<{ yr: string; title: string; body: string; now?: boolean }> = [
  {
    yr: "The early years",
    title: "Grew up around it",
    body: "Dentistry was the backdrop long before it was the work — the people, the practices, the rhythms of an industry most folks only see from the chair.",
  },
  {
    yr: "≈2016",
    title: "Into the business of dentistry",
    body: "The industry became the career — ten years on its business side, working with dentists and dental groups on the decisions that shape practices.",
  },
  {
    yr: "The decade",
    title: "Matches, made the hard way",
    body: "Ten years watching the industry's hiring machinery stay broken: mismatch-by-keyword on the boards, $30,000 introductions from the agencies.",
  },
  {
    yr: "2026",
    title: "DSO Hire — the missing piece, built properly",
    body: "PracticeFit scores what actually predicts whether someone stays: pace, schedule, mentorship, the way an office feels. Around it, the full hiring machine dental groups never had — flat-fee, dental-only, direct.",
  },
  {
    yr: "Today",
    title: "Open to every group and every candidate",
    body: "The marketplace both sides should have had years ago.",
    now: true,
  },
];

function Timeline() {
  return (
    <section
      className="border-y border-[var(--rule)] px-6 sm:px-14 py-24"
      style={{ background: "var(--heritage-tint)" }}
    >
      <div className="max-w-[1080px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          How we got here
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "60ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12"
        >
          A decade inside. One missing piece.
        </h2>
        <div className="relative pl-9 before:content-[''] before:absolute before:left-2 before:top-1.5 before:bottom-1.5 before:w-[2px] before:bg-[var(--rule-strong)]">
          {TIMELINE.map((t, i) => (
            <div
              key={t.title}
              data-reveal
              style={{ "--mk-delay": `${i * 60}ms` } as React.CSSProperties}
              className="relative pb-10 last:pb-0"
            >
              <span
                aria-hidden
                className={`absolute -left-[32px] top-1 w-3.5 h-3.5 border-[3px] border-heritage ${
                  t.now ? "bg-heritage" : "bg-ivory"
                }`}
              />
              <div className="text-[10px] font-bold tracking-[1.8px] uppercase text-heritage-deep">
                {t.yr}
              </div>
              <div className="text-[18px] font-extrabold tracking-[-0.2px] text-ink mt-1 mb-1.5">
                {t.title}
              </div>
              <p className="text-[14.5px] text-slate-body leading-[1.7] max-w-[560px]">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   PROMISES — claims that map 1:1 to real architecture
═══════════════════════════════════════════════════════ */

const PROMISES = [
  {
    title: "Never charge placement fees",
    body: "One flat monthly fee. Hire one person or thirty — the price doesn't move. We will never take a percentage of anyone's salary.",
  },
  {
    title: "Never out a candidate to their employer",
    body: "Anonymous browsing is masked everywhere a candidate appears — every surface, every email, enforced in code. A job search shouldn't risk the job you have.",
  },
  {
    title: "Never fake a match score",
    body: "PracticeFit only scores what both sides actually said. No signal, no score — and a thin profile is never punished for being thin.",
  },
  {
    title: "Never let an algorithm reject a person",
    body: "Fit scores inform humans; they never auto-screen. Every candidate gets seen. That's a hard rule in the engine, not a policy doc.",
  },
  {
    title: "Never sell your data",
    body: "Candidates and groups are the customers, not the product. Profiles, salaries, pipelines — none of it is for sale to anyone.",
  },
  {
    title: "Never stop being dental-only",
    body: "No warehouse jobs, no restaurant shifts. Dentistry is the whole product — that focus is why the matching works.",
  },
];

function Promises() {
  return (
    <section className="px-6 sm:px-14 py-24 max-w-[1080px] mx-auto">
      <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        The operating rules
      </div>
      <h2
        data-reveal
        style={{ "--mk-delay": "60ms" } as React.CSSProperties}
        className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-4"
      >
        What we will never do.
      </h2>
      <p
        data-reveal
        style={{ "--mk-delay": "120ms" } as React.CSSProperties}
        className="text-[15px] text-slate-body leading-[1.7] max-w-[620px] mb-11"
      >
        These aren&rsquo;t values-page platitudes — they&rsquo;re engineering
        constraints. Several are enforced in the database itself.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {PROMISES.map((p, i) => (
          <div
            key={p.title}
            data-reveal
            style={{ "--mk-delay": `${i * 60}ms` } as React.CSSProperties}
            className="bg-white border border-[var(--rule-strong)] p-6 flex gap-4 items-start"
          >
            <span
              aria-hidden
              className="flex items-center justify-center w-[30px] h-[30px] shrink-0 bg-ink text-ivory text-[12px] font-extrabold"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-[15.5px] font-extrabold tracking-[-0.2px] text-ink mb-1.5">
                {p.title}
              </h3>
              <p className="text-[13.5px] text-slate-body leading-[1.65]">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   CLOSING — navy band, ivory signature, both doors
═══════════════════════════════════════════════════════ */

function FinalCta() {
  return (
    <section className="relative bg-ink text-ivory px-6 sm:px-14 py-24 overflow-hidden text-center">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,122,96,0.12), transparent 65%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative max-w-[820px] mx-auto">
        <h2
          data-reveal
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.4px] leading-[1.08] mb-4"
        >
          Come see what we built.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "60ms" } as React.CSSProperties}
          className="text-[15px] text-ivory/60 leading-[1.7] max-w-[540px] mx-auto mb-8"
        >
          Whichever side of the chair you&rsquo;re on, the door&rsquo;s open.
        </p>
        <div data-reveal style={{ "--mk-delay": "120ms" } as React.CSSProperties}>
          <Image
            src="/about/signature-ivory.png"
            alt=""
            aria-hidden
            width={151}
            height={48}
            className="mx-auto mb-9 -rotate-2 opacity-90 select-none"
          />
        </div>
        <div
          data-reveal
          style={{ "--mk-delay": "180ms" } as React.CSSProperties}
          className="flex flex-wrap gap-3.5 justify-center"
        >
          <Link
            href="/for-dental-groups"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ivory text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ivory-deep transition-colors"
          >
            Explore Dental Group Hiring
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center px-7 py-[13px] border border-ivory/35 text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:border-heritage-light hover:text-heritage-light transition-colors"
          >
            Browse Dental Jobs
          </Link>
        </div>
      </div>
    </section>
  );
}
