/**
 * / — the DSO Hire lobby (#115 Day-31 rework).
 *
 * v2 of the dual-doorway home. The IA survives — two equal doors, because
 * the marketplace needs both sides — but the page stopped DESCRIBING the
 * platform and started DEMONSTRATING it:
 *
 *   1. HERO — the doors themselves show product: a miniature living kanban
 *      inside the Groups door, a miniature fit dial filling inside the
 *      Candidates door. CTAs go EXACTLY where they promise (Browse Dental
 *      Jobs → /jobs); the pitch pages ride labeled secondary links.
 *   2. LIVE MARKETPLACE BAND — the creative unlock: jobs are public data,
 *      so the homepage shows REAL inventory. DB-truth counters + a slow
 *      marquee of actual openings (title/location/pay — deliberately NO
 *      employer names, so anonymity masking can't be violated here).
 *      Honesty floors in lib/marketing/home-live.ts hide the band
 *      gracefully when inventory is thin (post-seed-scrub safety).
 *   3. FILM STRIP + MACHINE BAND (Day 32 port, FOH 100x Model 01) — drawn
 *      product frames walking the back office, then the named platform
 *      pitch with real numbers. Supersedes the old employer proof strip
 *      (its three cards were a subset). The candidate moat strip stays —
 *      résumé builder + privacy are homepage-grade claims.
 *   4. FOUNDER LINE — ten-years-in-the-business-of-dentistry voice (Day 32
 *      reword: the old "built by operators" claim was inaccurate — founder
 *      is business-side, not an operator; see memory), until /about ships.
 *   5. Closing doorways (unchanged — it worked).
 *
 * SEO posture unchanged: `/` carries brand/marketplace keywords; the two
 * side pages own audience-intent keywords. The marquee adds real, fresh,
 * crawlable job titles to the highest-authority URL — a bonus, not the
 * strategy.
 */

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  MapPin,
  Stethoscope,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { FilmStrip } from "@/components/marketing/film-strip";
import { CountUp } from "@/components/marketing/motion";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import {
  getHomeLiveSnapshot,
  type HomeLiveSnapshot,
  type MarqueeJob,
} from "@/lib/marketing/home-live";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "DSO Hire — Dental hiring, done direct.",
  },
  description:
    "DSO Hire is the dental-only job platform connecting multi-location dental groups (DSOs) with dental professionals — directly. No per-listing fees, no placement fees, no agency middlemen. Whether you're hiring across your practices or looking for your next dental role, start here.",
};

export default async function Home() {
  const live = await getHomeLiveSnapshot();
  return (
    <SiteShell>
      <Hero />
      <LiveMarketBand live={live} />
      <FilmStrip />
      <MachineBand />
      <CandidateStrip />
      <FounderLine />
      <ClosingDoorways />
    </SiteShell>
  );
}

/* ═══════════════════════════════════════════════════════
   HERO — equal-weight doors that DEMONSTRATE
═══════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-[120px] pb-16 px-6 sm:px-14">
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

      <div className="relative z-10 max-w-[1180px] mx-auto text-center">
        <span
          data-reveal
          className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.8px] uppercase text-ink border border-heritage/35 mb-5"
          style={{
            background: "var(--heritage-tint)",
            boxShadow: "0 0 0 4px var(--heritage-glow)",
          }}
        >
          <span className="text-heritage-deep">★</span>
          <span>The dental-only hiring platform</span>
        </span>

        <h1
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.025em] leading-[1.02] text-ink mb-4"
        >
          Dental hiring,{" "}
          <em className="not-italic text-heritage-light">done direct.</em>
        </h1>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[600px] mx-auto mb-9"
        >
          Multi-location dental groups and dental professionals, connected
          directly. No agencies, no per-listing fees, no middlemen.
        </p>

        {/* ── The equal-weight dual entry — now demonstrating, not describing ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
          <DoorwayPanel
            accent="ink"
            icon={Building2}
            eyebrow="Dental Groups"
            title="Hiring across your practices"
            body="Post across every practice on one flat monthly subscription, with an applicant pipeline built for the way dental groups hire."
            proof="Flat monthly fee · No per-listing fees · No placement charges"
            demo={<MiniKanban />}
            ctaLabel="Explore Dental Group Hiring"
            ctaHref="/for-dental-groups"
            secondaryLabel="See pricing"
            secondaryHref="/pricing"
            revealDelay={200}
          />
          <DoorwayPanel
            accent="heritage"
            icon={Stethoscope}
            eyebrow="Job Candidates"
            title="Find your next dental role"
            body="Real openings at multi-location dental groups — clinical and corporate, hygiene through specialist — scored to how you actually like to work."
            proof="Free forever · Direct apply · Private from your current office"
            demo={<MiniDial />}
            ctaLabel="Browse Dental Jobs"
            ctaHref="/jobs"
            secondaryLabel="How it works for candidates"
            secondaryHref="/for-candidates"
            revealDelay={280}
          />
        </div>
      </div>
    </section>
  );
}

/* ── Door miniature: living kanban (decorative, plays once on load) ── */

function MiniKanban() {
  return (
    <div className="mt-5 mb-1 grid grid-cols-3 gap-2" aria-hidden>
      {[
        { label: "New", bars: 2 },
        { label: "Interview", bars: 1 },
        { label: "Offer", bars: 1 },
      ].map((col) => (
        <div key={col.label} className="bg-ivory/10 border border-ivory/15 p-1.5">
          <div className="text-[8px] font-bold tracking-[1.4px] uppercase text-ivory/55 mb-1.5">
            {col.label}
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: col.bars }).map((_, i) => (
              <div key={i} className="h-3.5 bg-ivory/20" />
            ))}
            {/* the traveling chip lives IN the Interview slot and slides in
                from the column to its left — landing can't miss. */}
            {col.label === "Interview" && <div className="mini-kb-chip" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Door miniature: fit dial filling to 92 (decorative) ── */

function MiniDial() {
  return (
    <div className="mt-5 mb-1 flex items-center gap-4" aria-hidden>
      <div className="relative w-[64px] h-[64px] shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="-rotate-90">
          <circle cx="32" cy="32" r="26" stroke="rgba(247,244,237,0.18)" strokeWidth="6" fill="none" />
          <circle
            className="mini-dial-arc"
            cx="32"
            cy="32"
            r="26"
            stroke="#F7F4ED"
            strokeWidth="6"
            fill="none"
          />
        </svg>
        <span className="mini-dial-num absolute inset-0 flex items-center justify-center text-[18px] font-extrabold tracking-[-0.5px] text-ivory">
          92
        </span>
      </div>
      <div className="text-[11px] leading-snug text-ivory/70">
        {/* The real two-tone wordmark, on an ivory pill so it survives the
            green door (Cam, Day 31). It embeds its own sparkle mark. */}
        <span className="inline-flex items-center bg-ivory px-2 py-1 mb-1.5">
          <PracticeFitWordmark surface="light" tm className="text-[14px]" />
        </span>
        <span className="block">
          Every opening, scored against how you work — schedule, pace,
          culture, commute.
        </span>
      </div>
    </div>
  );
}

function DoorwayPanel({
  accent,
  icon: Icon,
  eyebrow,
  title,
  body,
  proof,
  demo,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  revealDelay,
}: {
  /** "ink" = navy block, "heritage" = green block. Equal weight, distinct identity. */
  accent: "ink" | "heritage";
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  /** Single dot-separated proof line — keeps the panel compact (above the fold). */
  proof: string;
  /** The door's product miniature — show, don't tell. */
  demo?: React.ReactNode;
  /**
   * CTAs go EXACTLY where they promise (Cam, Day 31); the pitch page rides
   * the secondary link. Panel is a div so two destinations can coexist.
   */
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  /** #115 FOH-1 — scroll-settle stagger (ms). */
  revealDelay?: number;
}) {
  const isInk = accent === "ink";
  return (
    <div
      data-reveal
      className={`group relative flex flex-col p-7 sm:p-8 text-ivory motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 overflow-hidden ${
        isInk ? "bg-ink" : "bg-heritage"
      }`}
      style={
        {
          boxShadow:
            "0 28px 56px -28px rgba(7,15,28,0.40), 0 12px 24px -12px rgba(7,15,28,0.18)",
          "--mk-delay": revealDelay ? `${revealDelay}ms` : undefined,
        } as React.CSSProperties
      }
    >
      {/* Top accent stripe — true cross-lens reciprocity: the navy door
          wears heritage, the green door wears navy. (The old ivory stripe
          on green read as a gap that made the card look shorter — Cam.) */}
      <span
        aria-hidden
        className={`absolute top-0 inset-x-0 h-[3px] ${
          isInk ? "bg-heritage" : "bg-ink"
        }`}
      />

      {/* Solid ivory icon square — crisp on the colored bg, color-inverted icon */}
      <span
        className={`inline-flex items-center justify-center w-11 h-11 mb-5 bg-ivory ${
          isInk ? "text-ink" : "text-heritage-deep"
        }`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/65 mb-1.5">
        {eyebrow}
      </div>
      <div className="text-[24px] sm:text-[28px] font-extrabold tracking-[-0.6px] leading-[1.08] text-ivory mb-2.5">
        {title}
      </div>
      <p className="text-[14px] text-ivory/80 leading-[1.55] mb-3.5">{body}</p>

      {/* Single-line proof — dot-separated keyword chips */}
      <div className="text-[10.5px] font-bold tracking-[1.6px] uppercase text-ivory/55">
        {proof}
      </div>

      {/* The miniature — the door shows the product. */}
      {demo}

      {/* CTA block — mt-auto bottom-anchors the whole row so BOTH doors'
          buttons sit at identical heights regardless of demo height
          (symmetry — Cam). */}
      <div className="mt-auto pt-6 flex flex-col">
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-[12px] font-bold tracking-[1.8px] uppercase bg-ivory text-ink hover:bg-ivory-deep transition-colors"
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
        </Link>

        {/* Secondary — the pitch/detail page, named for what it is. */}
        <Link
          href={secondaryHref}
          className="mt-3.5 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[1.6px] uppercase text-ivory/65 hover:text-ivory transition-colors"
        >
          {secondaryLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LIVE MARKETPLACE BAND — real inventory, DB-truth numbers
═══════════════════════════════════════════════════════ */

function LiveMarketBand({ live }: { live: HomeLiveSnapshot }) {
  const hasMarquee = live.marquee.length > 0;
  if (!hasMarquee && !live.showCounters) return null;
  return (
    // Heritage wash — the centerpiece band deliberately breaks the
    // ivory/cream rhythm (Cam, Day 31). White cards pop against it.
    <section
      className="border-y border-heritage/25 py-14 overflow-hidden"
      style={{ background: "var(--heritage-tint)" }}
    >
      <div className="max-w-[1240px] mx-auto px-6 sm:px-14">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div>
            <div data-reveal className="flex items-center gap-2 text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-heritage opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
              </span>
              On The Board Right Now
            </div>
            <h2
              data-reveal
              style={{ "--mk-delay": "70ms" } as React.CSSProperties}
              className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] text-ink"
            >
              Real openings. Live counts. No vanity numbers.
            </h2>
          </div>

          {live.showCounters && (
            <div
              data-reveal
              style={{ "--mk-delay": "140ms" } as React.CSSProperties}
              className="flex items-center gap-8"
            >
              <LiveStat value={live.activeJobs} label="Open roles live" />
              <LiveStat value={live.states} label="States covered" />
              <div>
                <div className="text-[34px] font-extrabold tracking-[-1.5px] leading-none text-heritage-deep tabular-nums">
                  $0
                </div>
                <div className="mt-1 text-[10px] font-bold tracking-[1.8px] uppercase text-slate-meta">
                  Placement fees, ever
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The marquee — full-bleed, real jobs, no employer names by design. */}
      {hasMarquee && (
        <div data-reveal style={{ "--mk-delay": "200ms" } as React.CSSProperties}>
          <div className="mq">
            <div className="mq-track">
              {[...live.marquee, ...live.marquee].map((job, i) => (
                <MarqueeCard key={`${job.id}-${i}`} job={job} ariaHidden={i >= live.marquee.length} />
              ))}
            </div>
          </div>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-14 mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.8px] uppercase text-heritage-deep hover:text-ink transition-colors"
            >
              Browse every opening
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function LiveStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-[34px] font-extrabold tracking-[-1.5px] leading-none text-ink tabular-nums">
        <CountUp to={value} duration={800} />
      </div>
      <div className="mt-1 text-[10px] font-bold tracking-[1.8px] uppercase text-slate-meta">
        {label}
      </div>
    </div>
  );
}

function MarqueeCard({ job, ariaHidden }: { job: MarqueeJob; ariaHidden?: boolean }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      className="group/card flex flex-col w-[280px] shrink-0 bg-white border border-[var(--rule)] px-5 py-4 hover:border-heritage hover:shadow-[0_14px_28px_-16px_rgba(7,15,28,0.22)] transition-all"
    >
      <span className="inline-flex self-start items-center px-1.5 py-0.5 mb-2.5 text-[8.5px] font-bold tracking-[1.4px] uppercase text-heritage-deep border border-heritage/30" style={{ background: "var(--heritage-tint)" }}>
        {job.chip}
      </span>
      <span className="text-[14.5px] font-extrabold tracking-[-0.3px] leading-snug text-ink mb-1.5 line-clamp-2">
        {job.title}
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 text-[12px] text-slate-body">
        <span className="inline-flex items-center gap-1 min-w-0">
          <MapPin className="h-3 w-3 shrink-0 text-slate-meta" />
          <span className="truncate">{job.location ?? "Multiple locations"}</span>
        </span>
        {job.pay && (
          <span className="font-bold text-heritage-deep whitespace-nowrap tabular-nums">
            {job.pay}
          </span>
        )}
      </span>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════
   MACHINE BAND — the back office, named and numbered
   (Day 32 port, FOH 100x Model 01. Supersedes the old
   employer proof strip — same depth claim, with receipts.
   Stats are REAL: 30+ can()-guarded actions, 12 PF dims,
   18 seeded automation rules, 6 résumé templates.)
═══════════════════════════════════════════════════════ */

function MachineBand() {
  const stats = [
    { value: 30, suffix: "+", label: "Permission-gated team actions" },
    { value: 12, suffix: "", label: "PracticeFit scoring dimensions" },
    { value: 18, suffix: "", label: "Automation rules out of the box" },
    { value: 6, suffix: "", label: "ATS-safe résumé templates, free for candidates" },
  ];
  const items: Array<{ title: React.ReactNode; body: string; hg?: boolean }> = [
    {
      title: "Pipelines & stages",
      body: "Kanban pipelines per role, custom stages, bulk actions, stale alerts — across every practice from one screen.",
    },
    {
      title: (
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
          <PracticeFitWordmark surface="light" className="text-[17px]" />
          <span>+ DSOFit</span>
        </span>
      ),
      body: "Two-sided fit scoring for clinical and corporate roles. Displayed, never used to auto-screen. Honest by design.",
      hg: true,
    },
    {
      title: "Automations & sequences",
      body: "Stage-triggered rules, nurture sequences, interview reminders, weekly candidate drips.",
    },
    {
      title: "Offer approvals & comp guardrails",
      body: "Approval chains with held letters, comp bands per role and region, full audit trail.",
    },
    {
      title: "Permissions & confidential searches",
      body: "Per-teammate capabilities and database-enforced confidential roles for sensitive replacements.",
      hg: true,
    },
    {
      title: "Analytics & outcome proof",
      body: "Funnel, source, time-to-fill, and fit-to-outcome curves — your hiring as a managed operation.",
    },
  ];
  return (
    <section className="bg-cream border-t border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div
          data-reveal
          className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5"
        >
          The machine behind the marketplace
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-5"
        >
          A real ATS, not a job board with an inbox.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-base text-slate-body leading-[1.7] max-w-[640px]"
        >
          Legacy dental job boards hand you applicants and walk away. DSO Hire
          is the operating system for the entire hire — and it&apos;s all
          included in the flat fee.
        </p>

        <div
          data-reveal
          style={{ "--mk-delay": "200ms" } as React.CSSProperties}
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule-strong)] border border-[var(--rule-strong)] mt-10"
        >
          {stats.map((s) => (
            <div key={s.label} className="bg-ivory px-6 py-6">
              <div className="text-[34px] font-extrabold tracking-[-1.5px] leading-none text-ink tabular-nums">
                <CountUp to={s.value} duration={800} />
                {s.suffix && <span className="text-heritage">{s.suffix}</span>}
              </div>
              <div className="mt-2 text-[10px] font-bold tracking-[1.4px] uppercase text-slate-meta leading-[1.5]">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-10">
          {items.map((f, i) => (
            <div
              key={i}
              data-reveal
              style={{ "--mk-delay": `${i * 60}ms` } as React.CSSProperties}
              className={`bg-white border border-[var(--rule-strong)] border-t-[3px] p-6 ${
                f.hg ? "border-t-heritage" : "border-t-ink"
              }`}
            >
              <h3 className="text-[15px] font-extrabold tracking-[-0.2px] leading-tight text-ink mb-1.5">
                {f.title}
              </h3>
              <p className="text-[13px] text-slate-body leading-[1.65]">{f.body}</p>
            </div>
          ))}
        </div>

        <div
          data-reveal
          className="flex flex-wrap gap-3.5 mt-10"
        >
          <Link
            href="/for-dental-groups"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
          >
            Explore The Platform
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center px-7 py-[13px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:border-ink hover:bg-cream transition-colors"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   CANDIDATE STRIP — the moat, candidate-voiced
═══════════════════════════════════════════════════════ */

function CandidateStrip() {
  return (
    <section className="bg-white border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 lg:gap-20 items-center">
        <div className="order-2 lg:order-1 grid grid-cols-1 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {[
            {
              title: "Your PracticeFit™ score on every job",
              body: "Five minutes of questions about how you actually like to work — then every opening shows you a fit score and the plain-English why.",
            },
            {
              title: "A free résumé builder that's actually good",
              body: "Six ATS-safe dental templates, built from your profile, exported as a real PDF. Yours to use anywhere — even off-platform.",
            },
            {
              title: "Private from your current office",
              body: "Browsing is invisible, and anonymous mode masks your name and photo from any employer you haven't applied to. Looking around while employed is normal — we built for it.",
            },
          ].map((f, i) => (
            <div
              key={f.title}
              data-reveal
              style={{ "--mk-delay": `${i * 90}ms` } as React.CSSProperties}
              className="bg-cream/60 p-7"
            >
              <h3 className="text-[16px] font-extrabold tracking-[-0.3px] leading-tight text-ink mb-1.5">
                {f.title}
              </h3>
              <p className="text-[13.5px] text-slate-body leading-[1.6]">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="order-1 lg:order-2">
          <div data-reveal className="mb-4">
            <PracticeFitWordmark surface="light" tm className="text-[26px]" />
          </div>
          <h2
            data-reveal
            style={{ "--mk-delay": "70ms" } as React.CSSProperties}
            className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-6"
          >
            Job hunting that respects your license — and your privacy.
          </h2>
          <p
            data-reveal
            style={{ "--mk-delay": "140ms" } as React.CSSProperties}
            className="text-base text-slate-body leading-[1.7] max-w-[520px] mb-8"
          >
            Free forever, no premium tier, no résumé reselling. Apply direct
            to the group that posted the job — your application never passes
            through a recruiter taking 20% on the way.
          </p>
          <div
            data-reveal
            style={{ "--mk-delay": "200ms" } as React.CSSProperties}
            className="flex flex-wrap gap-3.5"
          >
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-heritage text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors"
            >
              Browse Dental Jobs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/practicefit"
              className="inline-flex items-center px-7 py-[13px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:border-ink hover:bg-cream transition-colors"
            >
              Meet PracticeFit
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   FOUNDER LINE — signed, human, brief (until /about ships)
═══════════════════════════════════════════════════════ */

function FounderLine() {
  return (
    <section className="px-6 sm:px-14 py-20">
      <div
        data-reveal
        className="max-w-[820px] mx-auto text-center border-l-2 border-heritage bg-cream/70 px-8 sm:px-12 py-10"
      >
        <p className="text-lg sm:text-xl text-ink font-semibold leading-[1.6] tracking-[-0.2px] mb-5">
          &ldquo;Dentistry professionalized everything except hiring. After
          ten years on the business side of this industry, we built the
          missing piece — no agencies, no $30,000 introductions.&rdquo;
        </p>
        {/* Attribution. The real signature image slots in above this line
            when Brand Assets/founder-signature/ is processed (Day 31 plan) —
            keep it name-only until then; no faux script fonts. */}
        <div className="mb-6 text-[11px] font-bold tracking-[1.8px] uppercase text-slate-meta">
          <span className="text-heritage-deep">Cameron Eslinger</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          Founder, DSO Hire
        </div>
        <Link
          href="/about"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.8px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          More about us
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   CLOSING DOORWAYS — dual CTA, equal weight (unchanged)
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
        <h2 data-reveal className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.08] text-ivory mb-4">
          Pick your door.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-base text-ivory/60 leading-[1.7] max-w-[560px] mx-auto mb-10"
        >
          Two audiences, one dental-only platform. Head to the side that fits —
          you can always switch.
        </p>
        <div
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="flex flex-col sm:flex-row gap-3.5 justify-center"
        >
          <Link
            href="/for-dental-groups"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            <Building2 className="h-4 w-4" />
            I&apos;m a Dental Group
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
