/**
 * /for-candidates — long-form pitch page for dental professionals.
 *
 * Audience: dentists (general + specialty), hygienists, dental assistants,
 * front-desk / treatment coordinators, office + regional managers — anyone
 * looking for a role at a multi-location DSO.
 *
 * Tone (per Cam's lock 2026-05-05): warmer than /for-dsos. Plain-spoken.
 * "You / your" liberally. Acknowledge candidate feelings (the academic-
 * dentistry "DSOs are corporate dentistry" narrative) without dunking on
 * private practice. Real, fair, helpful.
 *
 * Visual direction: lighter than /for-dsos. More cream backgrounds, more
 * heritage-glow accents, less navy-block treatment. Stylized "Your
 * applications" mock card in hero (mirrors landing's kanban illustration
 * but candidate-side). Lucide icons + abstract decoration, no stock photos.
 *
 * Strategy reference: Marketing & Outreach/candidate-funnel-strategy.md
 *   - Tier 1 deliverable #1
 *   - Role-specific landing pages (Tier 1 #2) come in a follow-up sprint
 *   - DSO-vs-private-practice deep dive (Tier 1 #3) gets a dedicated
 *     /career-guides/dso-vs-private-practice page; this page has a SHORT
 *     honest-take section inline (per Cam's lock).
 */

import Link from "next/link";
import {
  ArrowRight,
  Stethoscope,
  Sparkles,
  Heart,
  Users,
  TrendingUp,
  GraduationCap,
  FileText,
  Lock,
  DollarSign,
  ShieldCheck,
  Send,
  Briefcase,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Dental Professionals",
  description:
    "Find your next role at a real, verified dental support organization. Free for candidates forever, no agency middlemen, transparent comp where DSOs share it.",
};

export default function ForCandidatesPage() {
  return (
    <SiteShell>
      <Hero />
      <Promises />
      <RoleBreakdown />
      <HonestTake />
      <CandidateBenefits />
      <FinalCta />
    </SiteShell>
  );
}

/* ───────── Hero ───────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-[140px] pb-24 px-6 sm:px-14">
      {/* Heritage glow — soft, lighter than /for-dsos */}
      <div
        aria-hidden
        className="absolute -top-[10%] -right-[15%] w-[60vw] h-[60vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      {/* Subtle dotted accent in lower-left */}
      <div
        aria-hidden
        className="absolute -bottom-[10%] -left-[10%] w-[40vw] h-[40vw] pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(var(--rule) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          maskImage:
            "radial-gradient(ellipse, #000 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse, #000 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-16 lg:gap-20 items-center">
        {/* Left column */}
        <div>
          <div className="flex items-center gap-3.5 mb-8">
            <span className="block w-7 h-px bg-heritage" />
            <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
              For Dental Professionals
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-1.6px] leading-[1.04] text-ink mb-7">
            Find your next role at a{" "}
            <em className="not-italic relative whitespace-nowrap text-heritage-light">
              real dental group
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-1.5 h-2 -z-10"
                style={{ background: "var(--heritage-tint)" }}
              />
            </em>
            .
          </h1>

          <p className="text-lg sm:text-xl text-slate-body leading-[1.65] max-w-[560px] mb-10">
            DSO Hire is the job board built for dental professionals
            applying to multi-location practices. Every employer is
            verified. You apply direct — no agency middleman, no resume
            reselling, no placement fee skimmed off your offer. Free for
            life.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 mb-9">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Browse Open Roles
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/candidate/sign-up"
              className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink hover:bg-cream transition-colors"
            >
              Create a Free Profile
            </Link>
          </div>

          <div className="flex items-center gap-2.5 text-[13px] text-slate-body tracking-[0.4px]">
            <span className="block w-1.5 h-1.5 bg-heritage rounded-full" />
            <span>
              <strong className="text-ink font-bold">Free forever</strong>{" "}
              for candidates · No premium memberships, ever
            </span>
          </div>
        </div>

        {/* Right column: stylized "Your applications" mock card */}
        <CandidateApplicationsPreview />
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────
   CANDIDATE APPLICATIONS PREVIEW
   Mirrors the kanban-illustration mock from the landing page, but
   from the candidate's perspective. Shows what their /candidate/dashboard
   feels like — application status tracking, real DSO names, real
   stage progression. No data — purely illustrative.
─────────────────────────────────────────────────────── */

interface CandidateAppPreview {
  dso: string;
  role: string;
  city: string;
  state: string;
  stage: "submitted" | "screening" | "interview" | "offer";
  daysAgo: number;
}

const PREVIEW_APPS: CandidateAppPreview[] = [
  {
    dso: "Greenfield Dental Group",
    role: "Associate Dentist",
    city: "Austin",
    state: "TX",
    stage: "interview",
    daysAgo: 3,
  },
  {
    dso: "Bright Smiles Pediatric",
    role: "Pediatric Hygienist",
    city: "Denver",
    state: "CO",
    stage: "screening",
    daysAgo: 6,
  },
  {
    dso: "Coastal Dental Partners",
    role: "Office Manager",
    city: "San Diego",
    state: "CA",
    stage: "submitted",
    daysAgo: 1,
  },
  {
    dso: "Heartland Family Dentistry",
    role: "EFDA",
    city: "Kansas City",
    state: "MO",
    stage: "offer",
    daysAgo: 11,
  },
];

const STAGE_DISPLAY: Record<
  CandidateAppPreview["stage"],
  { label: string; pill: string; dot: string }
> = {
  submitted: {
    label: "Submitted",
    pill: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
  screening: {
    label: "In review",
    pill: "bg-amber-50 text-amber-700",
    dot: "bg-amber-400",
  },
  interview: {
    label: "Interview scheduled",
    pill: "bg-blue-50 text-blue-700",
    dot: "bg-blue-400",
  },
  offer: {
    label: "Offer received",
    pill: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
};

function CandidateApplicationsPreview() {
  return (
    <div className="relative">
      <div
        className="bg-white border border-[var(--rule)] overflow-hidden"
        style={{
          boxShadow:
            "0 30px 60px -30px rgba(7,15,28,0.18), 0 10px 24px -12px rgba(7,15,28,0.10)",
          transform: "rotate(-0.5deg)",
        }}
      >
        {/* Browser-bar-style header */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-[var(--rule)] bg-cream/60">
          <span className="block w-2 h-2 rounded-full bg-slate-300" />
          <span className="block w-2 h-2 rounded-full bg-slate-300" />
          <span className="block w-2 h-2 rounded-full bg-slate-300" />
          <span className="ml-3 text-[10px] tracking-[0.4px] text-slate-meta">
            dsohire.com / candidate / applications
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[11px] font-bold tracking-[2px] uppercase text-heritage-deep">
              Your Applications
            </div>
            <div className="text-[10px] tracking-[0.5px] text-slate-meta">
              · Live
            </div>
          </div>
          <div className="text-[12px] text-slate-meta mb-4">
            {PREVIEW_APPS.length} active
          </div>

          <ul className="list-none space-y-2">
            {PREVIEW_APPS.map((app) => {
              const stage = STAGE_DISPLAY[app.stage];
              return (
                <li
                  key={app.dso}
                  className="border border-[var(--rule)] p-3 bg-white hover:border-heritage transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className="text-[13px] font-extrabold text-ink leading-tight truncate flex-1 min-w-0">
                      {app.dso}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.6px] whitespace-nowrap ${stage.pill}`}
                    >
                      <span
                        className={`block w-1 h-1 rounded-full ${stage.dot}`}
                      />
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-meta tracking-[0.2px]">
                    <span className="font-semibold text-slate-body">
                      {app.role}
                    </span>
                    <span className="opacity-50">·</span>
                    <span>
                      {app.city}, {app.state}
                    </span>
                    <span className="opacity-50">·</span>
                    <span>
                      {app.daysAgo}d
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Footer note — mirrors the "Realtime sync · just now" notification
              style from the landing kanban mock for visual consistency. */}
          <div className="mt-4 pt-3 border-t border-[var(--rule)] flex items-center gap-2 text-[10px] text-slate-meta tracking-[0.3px]">
            <Sparkles className="h-3 w-3 text-heritage" />
            <span>License renewal alert · 47 days · KS RDH-12345</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Promises ───────── */

const PROMISES = [
  {
    Icon: ShieldCheck,
    title: "Every employer is a verified DSO",
    body: "We verify every dental support organization before they post. No staffing-agency middlemen masquerading as employers. No solo practices listed as 'group practice.' Every job comes from a real DSO running multiple practices.",
  },
  {
    Icon: Send,
    title: "You apply direct",
    body: "Your resume goes straight to the DSO that posted the job — not to an agency that takes 15-25% of your first-year salary, not to a recruiter who'll pitch you to half a dozen practices you didn't ask about. Direct applications, every time.",
  },
  {
    Icon: Heart,
    title: "Free for candidates, forever",
    body: "DSOs pay a flat monthly subscription so you don't have to. No premium memberships, no resume highlights, no 'unlock contact info' upcharges, no annual renewals. Free really means free.",
  },
  {
    Icon: Sparkles,
    title: "Built for dental, not for everything",
    body: "Filters that understand the difference between an associate role and a partner-track. Comp ranges in dental terms. License-aware screening. Built specifically for dental — not generic job-board software with a dental tag bolted on.",
  },
];

function Promises() {
  return (
    <section className="bg-cream/60 border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          What's Different
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-4">
          Built around what dental pros actually want.
        </h2>
        <p className="text-[15px] text-slate-body leading-[1.7] max-w-[640px] mb-12">
          Most dental job boards were built for solo practices a decade ago,
          then bolted on multi-location features. DSO Hire was built the
          other way around — for dental professionals applying to real
          multi-location operations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {PROMISES.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="bg-white p-8 sm:p-10 hover:bg-cream/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-heritage/15 flex items-center justify-center mb-5">
                <Icon className="h-5 w-5 text-heritage-deep" />
              </div>
              <h3 className="text-[20px] font-extrabold tracking-[-0.4px] leading-tight text-ink mb-2.5">
                {title}
              </h3>
              <p className="text-[14px] text-slate-body leading-[1.7]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Role breakdown ───────── */

const ROLES = [
  {
    Icon: Stethoscope,
    title: "Dentists (general + specialty)",
    eyebrow: "DDS / DMD",
    href: "/for-dentists",
    advantages: [
      "Real benefits package — 401(k) match, group health, malpractice, paid CE allowance",
      "Mentorship + peer learning across multi-doc practices",
      "Career path clarity — associate → senior → partner track at some DSOs",
      "Modern equipment (CBCT, digital scanners, CAD/CAM) at scale",
    ],
  },
  {
    Icon: Sparkles,
    title: "Specialists",
    eyebrow: "Endo / Perio / Pedo / OS / Ortho",
    href: "/for-specialists",
    advantages: [
      "Built-in referral pipeline from sister GP practices",
      "Equipment + facility investments DSOs make at scale",
      "Travel-between-locations roles for high-demand specialties",
      "Production-based comp models that reward your specialization",
    ],
  },
  {
    Icon: Heart,
    title: "Hygienists",
    eyebrow: "RDH",
    href: "/for-hygienists",
    advantages: [
      "Defined PTO, real CE allowance, predictable schedules",
      "No 'double-up' expectations on solo-practice short days",
      "Local-anesthesia + laser certifications often DSO-paid",
      "Career path to lead hygienist or hygiene coordinator",
    ],
  },
  {
    Icon: GraduationCap,
    title: "Dental Assistants",
    eyebrow: "DA / EFDA",
    href: "/for-dental-assistants",
    advantages: [
      "Structured EFDA training with reimbursement",
      "Multi-doc variety — assist alongside specialists, not just one GP",
      "Career ladder to expanded functions, OM, or ops roles",
      "Real benefits (vs. unpaid time off at many solo offices)",
    ],
  },
  {
    Icon: Users,
    title: "Front Desk + Treatment Coordinators",
    eyebrow: "Patient-facing ops",
    href: "/for-front-desk",
    advantages: [
      "Real systems training (PMS, insurance verification, financing tools)",
      "Defined career path to OM is well-traveled at most DSOs",
      "Backup coverage — vacations don't crash the schedule",
      "Performance-based bonus structures common across DSOs",
    ],
  },
  {
    Icon: TrendingUp,
    title: "Office + Regional Managers",
    eyebrow: "OM / RM",
    href: "/for-office-managers",
    advantages: [
      "Real P&L responsibility with KPI scorecards",
      "DSO operating playbooks — not solo-practice trial-and-error",
      "Peer OM network across the DSO for problem-solving",
      "Compensation models (base + production %) more standardized",
    ],
  },
];

function RoleBreakdown() {
  return (
    <section className="px-6 sm:px-14 py-24 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        By Role
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-4">
        What's in it for you, by role.
      </h2>
      <p className="text-[15px] text-slate-body leading-[1.7] max-w-[640px] mb-12">
        DSO employment looks genuinely different depending on where you sit.
        Here's an honest read of what each role typically gets at a real
        multi-location DSO.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {ROLES.map(({ Icon, title, eyebrow, href, advantages }) => (
          <Link
            key={title}
            href={href}
            className="group bg-white p-7 sm:p-8 hover:bg-cream/40 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-heritage/15 flex items-center justify-center flex-shrink-0 group-hover:bg-heritage/25 transition-colors">
                <Icon className="h-4 w-4 text-heritage-deep" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                  {eyebrow}
                </div>
                <h3 className="text-[16px] font-extrabold tracking-[-0.3px] text-ink leading-tight">
                  {title}
                </h3>
              </div>
            </div>
            <ul className="list-none space-y-2 mt-1 mb-4">
              {advantages.map((adv, i) => (
                <li
                  key={i}
                  className="text-[13px] text-ink leading-[1.55] flex items-start gap-2"
                >
                  <span
                    aria-hidden
                    className="text-heritage-light font-extrabold flex-shrink-0 mt-0.5"
                  >
                    ✓
                  </span>
                  <span>{adv}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-3 border-t border-[var(--rule)] inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep group-hover:text-ink transition-colors">
              Learn more
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ───────── Honest take ───────── */

function HonestTake() {
  return (
    <section
      className="px-6 sm:px-14 py-24 relative overflow-hidden"
      style={{ background: "var(--heritage-tint)" }}
    >
      {/* Decorative heritage glow on the right */}
      <div
        aria-hidden
        className="absolute -top-[20%] -right-[15%] w-[50vw] h-[50vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(77,122,96,0.18), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative max-w-[820px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          The Honest Take
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.08] text-ink mb-10 max-w-[720px]">
          An honest read on DSO life.
        </h2>

        <div className="space-y-7 text-[16px] sm:text-[17px] text-ink leading-[1.75]">
          <p>
            You&apos;ve probably heard it. Dental school faculty, op-eds in
            industry pubs, and senior practice owners often frame DSO
            employment as &quot;corporate dentistry&quot; — shorthand for
            losing clinical autonomy, working under quotas, or selling out the
            profession. It&apos;s a narrative with real history behind it,
            especially from how some DSO models operated a decade ago.
          </p>
          <p>
            What&apos;s changed: industry data and candidate sentiment under
            35 increasingly point the other way. DSOs in 2026 hire faster, pay
            benefits solo practices struggle to match, invest in equipment at
            scale, and offer career paths that don&apos;t end at &quot;become
            an owner or stay an associate forever.&quot; The DSO model in 2026
            isn&apos;t the DSO model in 2014.
          </p>
          <p>
            That said — private practice has real, durable strengths.
            Ownership equity. Total clinical autonomy. Direct relationship
            with the same patients for decades. Physical-space control. If
            those are non-negotiable for you, private practice is still
            absolutely where you should look. You&apos;ll find better tools
            for that path on other platforms.
          </p>
          <p>
            DSO Hire exists for the dental professional who&apos;s looked at
            the trade-offs and decided multi-practice operations actually fit
            how they want to work. We&apos;re not here to dunk on private
            practice. We&apos;re here for the dentist, hygienist, or office
            manager who looked at their next ten years and decided the DSO
            route makes more sense — and who&apos;s tired of finding out about
            openings through a friend&apos;s friend or a third-party recruiter
            charging a 20% take.
          </p>
        </div>

        {/* Pull-quote-style attribution block */}
        <div className="mt-12 pt-10 border-t border-heritage/30">
          <p className="text-[14px] text-slate-body leading-[1.65] italic">
            We&apos;re building DSO Hire to make the choice clearer — not to
            push you one direction. The job board you actually use should
            respect that the decision is yours.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────── Candidate-side benefits ───────── */

const CANDIDATE_PERKS = [
  {
    Icon: GraduationCap,
    title: "CE tracking, free forever",
    body: "Track every continuing education credit you earn across employers. Get a 60-day reminder before your license expires. Free for every candidate — not gated to a 'pro' tier, not tied to which DSO you work for.",
  },
  {
    Icon: FileText,
    title: "Apply once with your profile",
    body: "Build your candidate profile once. Apply to as many roles as you want without re-uploading your resume, re-typing your work history, or re-explaining your specialty. Your profile follows you.",
  },
  {
    Icon: Lock,
    title: "Your data stays yours",
    body: "We don't sell candidate data. We don't broker your resume to recruiters who didn't post the job. The platform delivers your application to the DSO that posted it, full stop.",
  },
  {
    Icon: DollarSign,
    title: "Transparent comp where DSOs share it",
    body: "When a DSO shares the salary range for a role, we show it on every listing. When they don't, we tell you that too — no fake 'competitive pay' filler. Some practices share, some don't. Either way, no surprises.",
  },
];

function CandidateBenefits() {
  return (
    <section className="bg-white px-6 sm:px-14 py-24 border-y border-[var(--rule)]">
      <div className="max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          On the Candidate Side
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-4">
          Built for you, not just the employer.
        </h2>
        <p className="text-[15px] text-slate-body leading-[1.7] max-w-[640px] mb-12">
          A two-sided marketplace only works when both sides win. Here&apos;s
          the candidate side — the parts of DSO Hire designed to make your
          job hunt and your career easier, not just to fill the employer&apos;s
          inbox.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {CANDIDATE_PERKS.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="border border-[var(--rule-strong)] bg-cream/40 p-7 hover:bg-cream/60 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-full bg-heritage flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-ivory" />
                </div>
                <h3 className="text-[16px] font-extrabold tracking-[-0.3px] text-ink">
                  {title}
                </h3>
              </div>
              <p className="text-[14px] text-slate-body leading-[1.7]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Final CTA ───────── */

function FinalCta() {
  return (
    <section
      className="relative overflow-hidden px-6 sm:px-14 py-24 text-center"
      style={{ background: "var(--heritage-tint)" }}
    >
      {/* Soft heritage glow behind the headline */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[60vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(77,122,96,0.22), transparent 60%)",
          filter: "blur(50px)",
        }}
      />

      <div className="relative max-w-[760px] mx-auto">
        <div className="flex items-center justify-center gap-3.5 mb-6">
          <Briefcase className="h-4 w-4 text-heritage-deep" />
          <span className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep">
            Find your next DSO
          </span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-5">
          Browse open roles, or just see what&apos;s out there.
        </h2>
        <p className="text-[15px] sm:text-[16px] text-slate-body leading-[1.7] mb-9 max-w-[560px] mx-auto">
          Free profile takes a couple minutes. Browse without an account if
          you&apos;d rather. No upsells, no premium tier, no agency calls —
          just dental jobs at real DSOs.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Browse Open Roles
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/candidate/sign-up"
            className="inline-flex items-center px-9 py-[15px] bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Create a Free Profile
          </Link>
        </div>
      </div>
    </section>
  );
}
