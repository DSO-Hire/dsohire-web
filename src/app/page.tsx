import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Columns3,
  MessageCircle,
  Sparkles,
  Star,
} from "lucide-react";
import { getAllTiers, type TierConfig } from "@/lib/stripe/prices";
import { SiteShell, BrandLockup } from "@/components/marketing/site-shell";

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <ProofStrip />
      <Comparison />
      <FeatureShowcase />
      <PricingTeaser />
      <HowItWorks />
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

        <h1 className="text-5xl sm:text-7xl lg:text-[80px] font-extrabold tracking-[-0.025em] leading-[0.98] text-ink mb-12">
          Hire across every practice
          <br />
          <em className="not-italic relative whitespace-nowrap text-heritage-light">
            without per-listing pricing.
            <span
              aria-hidden
              className="absolute left-0 right-0 bottom-1.5 h-2 -z-10"
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
              Built for multi-location dental support organizations. Post unlimited
              roles across every location for a flat monthly subscription — no per-listing
              charges, no 15–25% placement fees, no recruiter middlemen.
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
                href="/jobs"
                className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
              >
                Browse Jobs
              </Link>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-body tracking-[0.4px]">
              <span className="block w-1.5 h-1.5 bg-heritage rounded-full" />
              <span>
                Plans from <strong className="text-ink font-bold">$499/mo</strong> · Unlimited multi-location posting
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
      { name: "Dr. Sarah Chen", role: "Associate Dentist", days: 1, heat: "cool", comments: 1 },
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
    cards: [
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

        {/* Pipeline header strip */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--rule)]">
          <div className="text-[9px] font-bold tracking-[3px] uppercase text-heritage-deep mb-1.5">
            Pipeline · Live
          </div>
          <div className="text-[15px] font-bold tracking-[-0.3px] text-ink leading-tight">
            Associate Dentist — General
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
          <ProofTagline>Unlimited Listings</ProofTagline>
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
   COMPARISON
═══════════════════════════════════════════════════════ */

function Comparison() {
  return (
    <section className="px-6 sm:px-14 pt-28 pb-24 max-w-[1240px] mx-auto">
      <SectionEyebrow>The Gap</SectionEyebrow>
      <SectionHeadline>
        Built for the operators DentalPost and staffing agencies don&apos;t serve.
      </SectionHeadline>
      <SectionSub>
        Existing options were built for solo practices or for one-off retained searches.
        Neither fits the operating model of a multi-location DSO that&apos;s hiring across
        roles and regions every week.
      </SectionSub>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mt-10">
        <CompareCell
          label="Option A"
          name="DentalPost"
          tagline="The default — but it was built for solo practices."
          items={[
            "Per-listing pricing that punishes multi-location postings",
            "No native multi-location job posting",
            "No team-based employer accounts",
            "Designed around individual practice owners",
          ]}
        />
        <CompareCell
          label="Option B"
          name="Staffing agencies"
          tagline="Effective, but priced for one-off executive searches."
          items={[
            "15–25% of first-year salary per placement",
            "Long engagement timelines for routine roles",
            "Limited visibility into the candidate pipeline",
            "No leverage as your hiring volume grows",
          ]}
        />
        <CompareCell
          label="DSO Hire"
          name="A flat-fee job board, built for DSOs."
          tagline="Subscribe once, post unlimited roles across every practice you operate."
          items={[
            "One subscription covers every location",
            "Unlimited active listings on Growth and Enterprise",
            "Multi-location job posting in a single flow",
            "Team accounts for your recruiters and regional managers",
          ]}
          featured
        />
      </div>
    </section>
  );
}

function CompareCell({
  label,
  name,
  tagline,
  items,
  featured,
}: {
  label: string;
  name: string;
  tagline: string;
  items: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`relative p-9 flex flex-col ${
        featured ? "bg-ink text-ivory" : "bg-white"
      }`}
    >
      {featured && <span className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />}
      {featured ? (
        // Featured cell wears the actual brand lockup in place of the OPTION-A/B
        // eyebrow — same vertical rhythm, brand identity instead of generic label.
        <div className="mb-4 -ml-px">
          <BrandLockup dark height={26} />
        </div>
      ) : (
        <div
          className={`text-[10px] font-bold tracking-[2.5px] uppercase mb-4 ${
            featured ? "text-heritage" : "text-slate-body"
          }`}
        >
          {label}
        </div>
      )}
      <div className="text-[22px] font-extrabold tracking-[-0.6px] mb-2.5 leading-tight">
        {name}
      </div>
      <div
        className={`text-[14px] mb-7 leading-snug ${
          featured ? "text-ivory/70" : "text-slate-body"
        }`}
      >
        {tagline}
      </div>
      <ul
        className={`mt-auto pt-5 list-none border-t ${
          featured ? "border-white/10" : "border-[var(--rule)]"
        }`}
      >
        {items.map((item, i) => (
          <li
            key={i}
            className={`text-[14px] py-2.5 flex items-start gap-2.5 leading-snug ${
              featured ? "text-ivory" : "text-slate-body"
            }`}
          >
            <span
              className={`flex-shrink-0 font-extrabold ${
                featured ? "text-heritage" : "text-heritage"
              }`}
            >
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FEATURE SHOWCASE
   2-3 split: top row carries the two most-visual features (AI JD generator
   + kanban realtime), bottom row carries the three supporting depth
   features. Cream background contrasts the white Comparison and Pricing
   sections that bracket it.
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
    title: "Verified DSO employers",
    body: "Every job is posted by an active dental support organization running 10+ practices. No staffing agencies, no recruiters, no solo practices padding the listings.",
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
          All tiers include unlimited multi-location posting, candidate dashboards, and
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
   FINAL CTA
═══════════════════════════════════════════════════════ */

function FinalCta() {
  return (
    <section className="bg-ivory px-6 sm:px-14 py-28 text-center">
      <div className="max-w-[780px] mx-auto">
        <h2 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5">
          Ready to replace per-listing fees with one flat subscription?
        </h2>
        <p className="text-base text-slate-body leading-[1.7] mb-9">
          One flat monthly subscription covers every practice. No per-listing fees,
          no placement commissions. Built for multi-location DSOs at every scale.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="#pricing"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            View Pricing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            Contact Us
          </Link>
        </div>
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
