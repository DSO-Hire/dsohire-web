/**
 * /for-dsos — the consolidated employer home for DSO Hire.
 *
 * Part of the dual-lens website restructure: `/` is now a neutral dual
 * doorway, and this page is THE fully-realized employer home. It inherits
 * the SEO role the old homepage held for employer-intent searches.
 *
 * Audience: COO / VP HR / Director of Recruiting at multi-location DSOs,
 * currently using DentalPost or staffing agencies.
 *
 * Goal: convert from "browsing" to "Start Posting Jobs" or "Contact Sales".
 *
 * Section order (sourced from both the old homepage and the prior
 * /for-dsos long-form pitch, deduplicated):
 *   1. Hero — old homepage's kanban-preview hero (CTAs re-pointed)
 *   2. ProofStrip — old homepage
 *   3. ProblemSection — prior /for-dsos
 *   4. RoiMath — prior /for-dsos
 *   5. FeatureShowcase — old homepage
 *   6. PricingTeaser — old homepage (id="pricing", hero CTA anchor)
 *   7. HowItWorks — old homepage
 *   8. FinalCta — prior /for-dsos (operator-voiced)
 */

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  Columns3,
  MessageCircle,
  Minus,
  Sparkles,
  Star,
} from "lucide-react";
import { getAllTiers, type TierConfig } from "@/lib/stripe/prices";
import { SiteShell, BrandLockup } from "@/components/marketing/site-shell";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DSO Hiring Platform — Flat-Fee Job Board for Multi-Location DSOs",
  description:
    "DSO Hire is the flat-fee job board built for multi-location dental support organizations. Post across every practice for one flat monthly fee — no per-listing fees, no 15–25% placement fees, no recruiter middlemen. Multi-location DSO hiring, team accounts, and an applicant pipeline built for the way DSOs actually hire.",
  keywords: [
    "DSO hiring",
    "multi-location dental hiring",
    "dental support organization recruiting",
    "flat-fee dental job board",
    "no placement fees dental hiring",
    "dental ATS for DSOs",
  ],
};

export default function ForDsosPage() {
  return (
    <SiteShell>
      <Hero />
      <ProofStrip />
      <ProblemSection />
      <RoiMath />
      <FeatureShowcase />
      <PricingTeaser />
      <HowItWorks />
      <FAQ />
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

      <div className="relative z-10 max-w-[1240px] mx-auto">
        {/* ── Headline band — spans the full container so the H1 owns the
              top of the hero. The chip + headline don't compete for
              horizontal space with the kanban illustration anymore. */}
        <div className="mb-8">
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.8px] uppercase text-ink border border-heritage/35"
            style={{
              background: "var(--heritage-tint)",
              boxShadow: "0 0 0 4px var(--heritage-glow)",
            }}
          >
            <span className="text-heritage-deep">★</span>
            <span>Built for DSOs</span>
            <span className="text-heritage-deep">·</span>
            <span>10+ practices</span>
            <span className="text-heritage-deep">·</span>
            <span>Flat monthly fee</span>
          </span>
        </div>

        {/* Headline: text-4xl on phones (≤640px) → text-5xl at sm → text-7xl
              at md → text-[80px] at lg. The second-line `<em>` only locks
              `whitespace-nowrap` from lg up, where the type fits on one line;
              below that it's allowed to wrap so the headline never overflows
              the viewport. The heritage-tint underline is only rendered at
              lg+ for the same reason — `absolute` positioning on a wrapped
              inline element only sits under the last line and looks broken. */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-[80px] font-extrabold tracking-[-0.025em] leading-[0.98] text-ink mb-12">
          Hire across every practice.{" "}
          <br className="hidden sm:inline" />
          <em className="not-italic relative lg:whitespace-nowrap text-heritage-light">
            One flat monthly fee.
            <span
              aria-hidden
              className="hidden lg:block absolute left-0 right-0 bottom-1.5 h-2 -z-10"
              style={{ background: "var(--heritage-tint)" }}
            />
          </em>
        </h1>

        {/* ── Body band — narrower body copy on the left, wider kanban on
              the right. The kanban now gets ~60% of the container width
              (vs. ~49% in the old layout) and sits inset cleanly without
              crowding the right edge. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-16 items-start">
          <div>
            <p className="text-lg sm:text-xl text-slate-body leading-relaxed mb-10">
              Built for multi-location dental support organizations. Subscribe
              once and post across every practice you operate — flat monthly
              fee, no per-listing charges, no 15–25% placement fees, no
              recruiter middlemen.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 mb-9">
              <Link
                href="#pricing"
                className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
              >
                Start Posting Jobs
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
              >
                Contact Sales
              </Link>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-body tracking-[0.4px]">
              <span className="block w-1.5 h-1.5 bg-heritage rounded-full" />
              <span>
                Plans from <strong className="text-ink font-bold">$499/mo</strong> · Multi-location native · No placement fees
              </span>
            </div>
          </div>

          {/* Right cell: stylized employer kanban preview, now wider */}
          <HeroKanbanPreview />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────
   HERO KANBAN PREVIEW
   Static SVG/divs/Tailwind illustration that mirrors the real employer
   pipeline at /employer/jobs/[id]/applications. No data — just looks like
   the real kanban. STAGE_COLORS dot tints + heat-pill colors are pulled by
   eye from src/lib/applications/stages.ts.
─────────────────────────────────────────────────────── */

type HeatTone = "cool" | "warm" | "hot";
const HEAT_PILL: Record<HeatTone, string> = {
  cool: "bg-slate-100 text-slate-600",
  warm: "bg-amber-50 text-amber-700",
  hot: "bg-red-50 text-red-700",
};

interface HeroCard {
  name: string;
  role: string;
  days: number;
  heat: HeatTone;
  comments?: number;
  score?: string;
}

interface HeroColumn {
  label: string;
  /** Tailwind dot color for the column header pip. */
  dot: string;
  /** Header background tint (matches STAGE_COLORS bg). */
  bg: string;
  /** Header text tone. */
  text: string;
  cards: HeroCard[];
}

const HERO_COLUMNS: HeroColumn[] = [
  {
    label: "New",
    dot: "bg-slate-400",
    bg: "bg-slate-50",
    text: "text-slate-700",
    cards: [
      { name: "Maya Rodriguez RDH", role: "Hygienist", days: 2, heat: "cool" },
      { name: "Jordan Williams DA", role: "Dental Assistant", days: 3, heat: "cool", comments: 2 },
    ],
  },
  {
    label: "Screening",
    dot: "bg-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    cards: [
      { name: "Dr. Priya Patel", role: "Endodontist", days: 6, heat: "cool", comments: 3, score: "4.4" },
      { name: "Alex Thompson", role: "Front Desk Lead", days: 9, heat: "warm" },
    ],
  },
  {
    label: "Interview",
    dot: "bg-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    // Dr. Sarah Chen is at the top of Interview because she just moved
    // there (days: 0 → "just now", matching the floating "Maya moved
    // Dr. Chen to Interview · Realtime sync · just now" notification).
    cards: [
      { name: "Dr. Sarah Chen", role: "Associate Dentist", days: 0, heat: "cool", comments: 1 },
      { name: "Dr. Marcus Lee", role: "Associate Dentist", days: 11, heat: "warm", comments: 5, score: "4.7" },
      { name: "Riley Okafor RDH", role: "Hygienist", days: 16, heat: "hot", comments: 2 },
    ],
  },
  {
    label: "Offer",
    dot: "bg-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    cards: [
      { name: "Dr. Hannah Kim", role: "Pediatric Dentist", days: 4, heat: "cool", comments: 4, score: "4.9" },
    ],
  },
];

function HeroKanbanPreview() {
  // Kanban sits in the wider right cell of the body band (~60% of the
  // container at lg+). max-w-[720px] keeps it bounded on very wide
  // viewports while still letting it stretch substantially wider than
  // the original layout. mx-auto centers it within its cell when the
  // grid wraps to a single column on smaller screens.
  return (
    <div className="relative w-full max-w-[720px] mx-auto lg:ml-auto">
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
          <span className="ml-3 text-[12px] tracking-[0.4px] text-slate-meta truncate">
            dsohire.com / employer / jobs /{" "}
            <strong className="text-ink font-semibold">applications</strong>
          </span>
        </div>

        {/* Pipeline header strip — frames the kanban as a DSO-wide view
            since the candidates below span multiple roles (hygienists,
            dentists, specialists, front desk, etc.). The breadcrumb at
            the top of the mock (`/employer/jobs/applications`) already
            implies a cross-job view, so the title here is the DSO name.
            Greenfield Dental Group is the same fictional DSO used in the
            /for-candidates mock card for cross-page continuity. */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--rule)]">
          <div className="text-[9px] font-bold tracking-[3px] uppercase text-heritage-deep mb-1.5">
            Pipeline · Live
          </div>
          <div className="text-[15px] font-bold tracking-[-0.3px] text-ink leading-tight">
            Greenfield Dental Group
          </div>
          <div className="text-[12px] text-slate-body mt-0.5">
            8 candidates · 3 locations · 2 reviewers online
          </div>
        </div>

        {/* Board */}
        <div className="grid grid-cols-4 gap-px bg-[var(--rule)]">
          {HERO_COLUMNS.map((col) => (
            <div key={col.label} className="bg-white flex flex-col">
              <header
                className={`${col.bg} px-2.5 py-2 border-t-2 border-current ${col.text} flex items-center justify-between`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`block w-1.5 h-1.5 rounded-full ${col.dot}`} />
                  <span className="text-[8.5px] font-bold tracking-[1.6px] uppercase">
                    {col.label}
                  </span>
                </span>
                <span className="text-[9px] font-bold tabular-nums">
                  {col.cards.length}
                </span>
              </header>
              <div className="flex-1 p-1.5 space-y-1.5 bg-cream/40 min-h-[178px]">
                {col.cards.map((card) => (
                  <HeroKanbanCard key={card.name} {...card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating realtime notification */}
      <div
        className="absolute -bottom-5 -left-6 bg-white border border-[var(--rule)] px-4 py-3.5 flex items-center gap-3 max-w-[260px]"
        style={{
          boxShadow: "0 14px 28px -14px rgba(7,15,28,0.18)",
          transform: "rotate(-1.5deg)",
        }}
      >
        <span className="flex items-center justify-center w-8 h-8 bg-heritage text-ivory font-extrabold text-[13px] tracking-[-0.3px]">
          M
        </span>
        <div className="text-[12px] text-ink leading-snug font-semibold">
          Maya moved Dr. Chen to Interview
          <small className="block text-[10px] font-normal text-slate-body tracking-[0.3px] mt-0.5">
            Realtime sync · just now
          </small>
        </div>
      </div>
    </div>
  );
}

function HeroKanbanCard({ name, role, days, heat, comments, score }: HeroCard) {
  return (
    <div className="bg-white border border-[var(--rule)] px-2 py-1.5">
      <div className="text-[10.5px] font-bold text-ink truncate leading-tight mb-0.5">
        {name}
      </div>
      <div className="text-[9.5px] text-slate-body truncate mb-1.5">
        {role}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span
          className={`text-[8px] font-bold tracking-[0.8px] uppercase px-1 py-0.5 ${HEAT_PILL[heat]}`}
        >
          {days}d
        </span>
        <div className="flex items-center gap-1.5">
          {score && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-heritage-deep font-semibold tabular-nums">
              <Star className="h-2.5 w-2.5 fill-current" />
              {score}
            </span>
          )}
          {comments !== undefined && comments > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-meta tabular-nums">
              <MessageCircle className="h-2.5 w-2.5" />
              {comments}
            </span>
          )}
        </div>
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
        <div className="text-[12px] font-bold tracking-[2.5px] uppercase text-slate-body">
          Designed With{" "}
          <strong className="text-ink">Mid-Market DSO Operators</strong>
        </div>
        <div className="flex flex-wrap gap-9 items-center">
          <ProofTagline>Multi-Location DSOs</ProofTagline>
          <ProofTagline>No Per-Listing Fees</ProofTagline>
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
   THE PROBLEM
═══════════════════════════════════════════════════════ */

function ProblemSection() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          The Math Today
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-6">
          The two options on the market weren&apos;t built for the way you actually hire.
        </h2>
        <p className="text-base text-slate-body leading-[1.7] max-w-[640px] mb-12">
          Today&apos;s mid-market DSO has two real choices, and both punish you for
          operating at scale.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <ProblemCard
            heading="DentalPost"
            tagline="Built for solo practices. Priced per listing."
            points={[
              "Per-listing pricing means a 30-location DSO posting an associate role at three offices pays three times",
              "No native multi-location job posting — recruiters re-enter the same job over and over",
              "No team-based employer accounts. Office managers and regional directors all need separate logins",
              "Designed around individual practice owners, not multi-site operators",
            ]}
          />
          <ProblemCard
            heading="Staffing agencies"
            tagline="Effective, but priced for one-off executive searches."
            points={[
              "15–25% of first-year salary per placement. A $200K associate dentist costs you $30–50K in placement fees alone",
              "Routine roles (hygienists, dental assistants, office managers) move slowly through agency pipelines",
              "Limited visibility into the candidate pipeline — you see who they choose to share",
              "No leverage as your hiring volume grows. Hiring 10 people doesn&apos;t get you a discount",
            ]}
          />
          <AnswerCard />
        </div>
      </div>
    </section>
  );
}

/**
 * AnswerCard — the branded DSO Hire pivot inside the "Two Real Choices" grid.
 * Spans both columns at lg+, sits flush below the two ProblemCards via the
 * grid's gap-px rule so it reads as the third element of the comparison
 * without restructuring the rhetorical 2-card framing.
 */
function AnswerCard() {
  return (
    <div className="lg:col-span-2 relative bg-ink text-ivory p-10 lg:p-12 overflow-hidden">
      {/* Heritage hairline marks the rhetorical pivot from problem to answer. */}
      <span aria-hidden className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />
      {/* Soft heritage glow for the same depth treatment used on /how-it-works. */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          right: "-15%",
          width: "520px",
          height: "520px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,122,96,0.10), transparent 65%)",
          transform: "translateY(-50%)",
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-10 lg:gap-14">
        <div>
          <BrandLockup dark height={42} />
          <h3 className="text-[26px] sm:text-[32px] font-extrabold tracking-[-0.8px] leading-tight mt-8 mb-4">
            A flat-fee job board, built for DSOs.
          </h3>
          <p className="text-[15px] text-ivory/70 leading-[1.7] max-w-[420px]">
            Subscribe once, post across every practice you operate. One
            account, no per-listing fees, no placement fees, cancel anytime.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-3.5 list-none lg:pt-2 self-center">
          {[
            "One subscription covers every location",
            "Unlimited active listings on Growth and Enterprise",
            "Multi-location job posting in a single flow",
            "Team accounts for your recruiters and regional managers",
          ].map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[14px] text-ivory leading-[1.55]"
            >
              <Check
                className="h-4 w-4 text-heritage-light flex-shrink-0 mt-0.5"
                strokeWidth={3}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProblemCard({
  heading,
  tagline,
  points,
}: {
  heading: string;
  tagline: string;
  points: string[];
}) {
  return (
    <div className="bg-white p-10">
      <h3 className="text-[22px] font-extrabold tracking-[-0.6px] text-ink mb-2">
        {heading}
      </h3>
      <div className="text-[14px] text-slate-body mb-6 leading-snug">
        {tagline}
      </div>
      <ul className="list-none border-t border-[var(--rule)] pt-5">
        {points.map((point, i) => (
          <li
            key={i}
            className="text-[14px] text-slate-body py-2.5 flex items-start gap-2.5 leading-[1.55]"
          >
            <Minus className="h-4 w-4 text-slate-meta/50 flex-shrink-0 mt-0.5" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROI MATH
═══════════════════════════════════════════════════════ */

function RoiMath() {
  return (
    <section className="px-6 sm:px-14 py-28 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Run The Numbers
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-6">
        For a 25-practice DSO, the cost case takes about a minute.
      </h2>
      <p className="text-base text-slate-body leading-[1.7] max-w-[640px] mb-12">
        These are illustrative numbers based on the average mid-market DSO we
        designed for. Plug in your own and the conclusion holds.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        <RoiCard
          label="What you spend today"
          accent="slate"
          rows={[
            { item: "DentalPost listings (15 active × $99/mo)", value: "$1,485 / mo" },
            { item: "1 staffing-agency hire/quarter ($30K avg fee)", value: "$10,000 / mo" },
            { item: "Recruiter time re-entering jobs across listings", value: "Hidden" },
          ]}
          total="≈ $11,500 / mo"
          totalLabel="Annual: ~$138,000"
        />
        <RoiCard
          label="What DSO Hire costs"
          accent="heritage"
          rows={[
            { item: "Growth tier subscription", value: "$999 / mo" },
            { item: "Per-listing fees", value: "$0" },
            { item: "Placement fees", value: "$0" },
          ]}
          total="$999 / mo"
          totalLabel="Annual: $11,988"
        />
      </div>

      <div className="mt-10 bg-ink text-ivory p-8 sm:p-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-light mb-3">
          Net difference
        </div>
        <div className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight">
          DSO Hire pays for itself in the first month, every month, on a single
          replaced agency hire.
        </div>
      </div>
    </section>
  );
}

function RoiCard({
  label,
  rows,
  total,
  totalLabel,
  accent,
}: {
  label: string;
  rows: Array<{ item: string; value: string }>;
  total: string;
  totalLabel: string;
  accent: "slate" | "heritage";
}) {
  return (
    <div className="bg-white p-10">
      <div
        className={`text-[10px] font-bold tracking-[2.5px] uppercase mb-6 ${
          accent === "heritage" ? "text-heritage-deep" : "text-slate-body"
        }`}
      >
        {label}
      </div>
      <ul className="list-none border-t border-[var(--rule)] pb-4">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-6 py-3.5 border-b border-[var(--rule)] text-[14px]"
          >
            <span className="text-slate-body">{row.item}</span>
            <span className="font-bold text-ink whitespace-nowrap">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="pt-4 mt-2">
        <div className="text-3xl font-extrabold tracking-[-1px] text-ink">
          {total}
        </div>
        <div className="text-[12px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
          {totalLabel}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FEATURE SHOWCASE
   2-3 split: top row carries the two most-visual features (AI JD generator
   + kanban realtime), bottom row carries the three supporting depth
   features. Cream background contrasts the white sections that bracket it.
═══════════════════════════════════════════════════════ */

interface ShowcaseFeature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  status: "now" | "h2-2026";
}

const SHOWCASE_TOP: ShowcaseFeature[] = [
  {
    icon: Sparkles,
    title: "AI Job Description generator",
    body: "Type a brief, get a dental-specific posting in seconds. Knows DDS, RDH, EFDA, DEA, perio, and the rest of the vocabulary. Three tones, regenerate as often as you want, included at every tier.",
    status: "now",
  },
  {
    icon: Columns3,
    title: "Pipeline kanban with real-time team sync",
    body: "Drag candidates through New → Screening → Interview → Offer → Hired. When one recruiter moves a card, every teammate sees it within half a second. No refresh, no email chains.",
    status: "now",
  },
];

const SHOWCASE_BOTTOM: ShowcaseFeature[] = [
  {
    icon: Star,
    title: "Dental scorecards by role",
    body: "Multi-reviewer evaluations with role-specific rubrics. Your dentists score clinical fit; your office manager scores chairside. Aggregate scores roll up automatically.",
    status: "now",
  },
  {
    icon: BookOpen,
    title: "102-question screening library",
    body: "Curated dental questions for 7 role categories — Dentist, Specialist, Hygienist, Dental Assistant, Front Desk, Office Manager, Regional Manager. One click adds the recommended set.",
    status: "now",
  },
  {
    icon: BadgeCheck,
    title: "Multi-location DSO employers",
    body: "Every job is posted by an active dental support organization running multiple practices. No staffing agencies, no recruiters, no solo practices padding the listings — prohibited by our Acceptable Use Policy.",
    status: "now",
  },
];

function FeatureShowcase() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-28">
      <div className="max-w-[1240px] mx-auto">
        <SectionEyebrow>The Product</SectionEyebrow>
        <SectionHeadline>
          Built for how dental hiring actually works.
        </SectionHeadline>
        <SectionSub>
          Vertical software with the depth competitors gate behind their
          $1,500/month tiers — included at every paid tier.
        </SectionSub>

        {/* Top row — 2 columns, the most-visual features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {SHOWCASE_TOP.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>

        {/* Bottom row — 3 columns, supporting depth features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {SHOWCASE_BOTTOM.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: ShowcaseFeature }) {
  const Icon = feature.icon;
  const isLive = feature.status === "now";
  return (
    <div
      className="relative bg-white border border-[var(--rule)] p-7 flex flex-col motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 hover:border-[var(--rule-strong)] hover:shadow-[0_18px_36px_-20px_rgba(7,15,28,0.20)]"
    >
      {/* Status pill */}
      <span
        className={`absolute top-5 right-5 inline-flex items-center px-2 py-1 text-[9px] font-bold tracking-[1.6px] uppercase ${
          isLive
            ? "text-heritage-deep"
            : "text-slate-meta"
        }`}
        style={
          isLive
            ? { background: "var(--heritage-tint)" }
            : { background: "rgba(20, 35, 63, 0.05)" }
        }
      >
        {isLive ? "Available now" : "Coming H2 2026"}
      </span>

      {/* Heritage-tinted icon square */}
      <span
        className="inline-flex items-center justify-center w-10 h-10 mb-5 text-heritage-deep"
        style={{ background: "var(--heritage-tint)" }}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="text-[18px] font-extrabold tracking-[-0.4px] text-ink mb-2.5 leading-tight pr-20">
        {feature.title}
      </div>
      <p className="text-[14.5px] text-slate-body leading-[1.65]">
        {feature.body}
      </p>
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
      <div className="text-[12px] font-bold tracking-[2.5px] uppercase text-heritage mb-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mt-10">
          {tiers.map((tier) => (
            <PricingTier key={tier.id} tier={tier} />
          ))}
        </div>

        <p className="mt-10 text-[14px] text-slate-body text-center leading-relaxed">
          All tiers include multi-location posting, candidate dashboards, and
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
  // Mirrors the /pricing page TierCard exactly — Growth column fills navy with
  // ivory text, heritage-green floating "Most Popular" pill above the card, and
  // a heritage-green CTA button. Non-featured cards lift on hover for parity
  // with the rest of the marketing surfaces.
  const isFeatured = tier.badge === "Most popular";
  return (
    <div
      className={`relative p-9 flex flex-col motion-safe:transition-all motion-safe:duration-200 ${
        isFeatured
          ? "bg-ink text-ivory"
          : "bg-white text-ink motion-safe:hover:-translate-y-1 hover:shadow-[0_12px_28px_-14px_rgba(7,15,28,0.18)] hover:bg-cream/30"
      }`}
    >
      {isFeatured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-heritage text-ivory text-[9px] font-bold tracking-[2px] uppercase whitespace-nowrap z-10">
          Most Popular
        </div>
      )}

      <div
        className={`text-2xl font-extrabold tracking-[-0.6px] mb-2 ${
          isFeatured ? "text-ivory" : "text-ink"
        }`}
      >
        {tier.name}
      </div>
      <div
        className={`text-xs mb-6 min-h-[34px] leading-snug ${
          isFeatured ? "text-ivory/70" : "text-slate-body"
        }`}
      >
        {tier.tagline}
      </div>

      <div className="flex items-baseline gap-1.5 mb-1.5">
        <div
          className={`text-[40px] font-extrabold tracking-[-1.5px] leading-none ${
            isFeatured ? "text-ivory" : "text-ink"
          }`}
        >
          ${tier.monthlyPrice.toLocaleString()}
        </div>
        <div
          className={`text-[14px] font-medium ${
            isFeatured ? "text-ivory/70" : "text-slate-body"
          }`}
        >
          / month
        </div>
      </div>
      <div
        className={`text-[12px] tracking-[0.4px] mb-7 min-h-[32px] leading-[1.45] ${
          isFeatured ? "text-ivory/55" : "text-slate-meta"
        }`}
      >
        {tier.id === "starter" && "Most chosen for sub-20 location operators"}
        {tier.id === "growth" && "Unlimited listings unlocked"}
        {tier.id === "enterprise" && "Account management included"}
      </div>

      <Link
        href={`/employer/sign-up?tier=${tier.id}`}
        className={`block text-center px-4 py-3.5 text-[12px] font-bold tracking-[1.5px] uppercase mb-6 transition-colors border ${
          isFeatured
            ? "bg-heritage text-ivory border-heritage hover:bg-heritage-deep hover:border-heritage-deep"
            : "bg-ivory text-ink border-[var(--rule-strong)] hover:bg-ink hover:text-ivory hover:border-ink"
        }`}
      >
        {tier.id === "starter" && "Start with Starter"}
        {tier.id === "growth" && "Choose Growth"}
        {tier.id === "enterprise" && "Contact Sales"}
      </Link>

      <ul
        className={`list-none border-t pt-4 ${
          isFeatured ? "border-white/15" : "border-[var(--rule)]"
        }`}
      >
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className={`text-[13.5px] py-1.5 flex items-start gap-2 leading-snug ${
              isFeatured ? "text-ivory/90" : "text-ink"
            }`}
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
   FINAL CTA
═══════════════════════════════════════════════════════ */

function FinalCta() {
  return (
    <section className="bg-ivory px-6 sm:px-14 py-24 text-center">
      <div className="max-w-[680px] mx-auto">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-5">
          15-minute call. No demo gauntlet. No sales script.
        </h2>
        <p className="text-base text-slate-body leading-[1.7] mb-9">
          Built by operators, for operators — same team that writes the
          product answers the email. Ask the questions you actually want
          answered.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Contact Us
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   FAQ — employer-buying questions
═══════════════════════════════════════════════════════ */

const FAQ_ITEMS = [
  {
    q: "What does the subscription actually cover?",
    a: "Multi-location job postings, the full applicant pipeline with kanban + scorecards + team comments, candidate dashboards, branded company page, application + candidate data exports for your HR records, and Stripe-secured billing. Pricing scales with your practice count; features are the same depth at every paid tier. Active-listing caps are tier-based — Starter up to 50 active listings, Growth and Enterprise unlimited.",
  },
  {
    q: "Can I cancel or change tiers anytime?",
    a: "Yes. Change tiers or cancel from your billing settings — Stripe handles prorated billing automatically, and you keep access through the end of your current billing period. No retention call, no penalty.",
  },
  {
    q: "How does multi-location posting actually work?",
    a: "Write the job description once and select which of your practices it applies to in a single flow. We render a per-location listing for each, so candidates see the role at the location they're searching for, without you re-entering the same job. Posting to one practice or fifteen takes the same amount of time.",
  },
  {
    q: "Can I add my team — recruiters, regional managers, office managers?",
    a: "Yes. Starter includes up to 10 admin seats; Growth and Enterprise are unlimited. Hiring managers can be scoped to specific locations so they only see and act on what's relevant to them; admins see the whole DSO. Adding teammates doesn't change your billing — seat counts are bundled into the tier.",
  },
  {
    q: "Do you take a placement fee?",
    a: "Never. The monthly subscription is the entire cost — we don't take a cut of placements, and we don't charge per listing. Hire whoever applies, keep 100% of their first-year salary.",
  },
  {
    q: "How fast can we get started?",
    a: "Most DSOs are posting their first role within an hour of signing up. Sign up, pay through Stripe, add your locations, and you're live. No implementation fees, no demo gauntlet, no sales call required.",
  },
  {
    q: "What about Indeed, LinkedIn, and the other major job boards?",
    a: "Today, every DSO Hire job is searchable on the platform and indexed by Google for Jobs. Cross-posting integrations to Indeed, LinkedIn, and Facebook are on the H2 2026 roadmap — until then, many DSOs cross-post manually using the listing copy we generate.",
  },
];

function FAQ() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 pt-24 pb-24">
      <div className="max-w-[860px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          FAQ
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12">
          Operator questions, answered straight.
        </h2>
        <FaqAccordion items={FAQ_ITEMS} />
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
