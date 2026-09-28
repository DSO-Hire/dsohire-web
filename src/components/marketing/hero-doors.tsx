/**
 * HeroDoors — the homepage's two front doors (v3, 2026-09-28).
 *
 * v2's mini-kanban repeated the back-office showcase directly below, the
 * doors' CTAs sat at different heights, and the previews bled off the
 * bottom edge (read as cut off). v3:
 *   • Symmetry by construction: both doors are CSS subgrids sharing the
 *     parent's six row tracks (eyebrow, title, body, checks, actions,
 *     preview), so every row lines up across the pair regardless of copy
 *     length. Same action pattern on both.
 *   • Dental groups: a "hires this quarter" receipt. Hires print in one by
 *     one at a $0 placement fee beside the struck-through agency fee, and
 *     the "kept vs. agency" total steps up. Money is the buyer's hook,
 *     and nothing else on the page shows it this way.
 *   • Candidates: job cards cycle, each with its PracticeFit ring drawing
 *     to its score.
 *   • Both previews sit fully inside their doors at the same height.
 *
 * Above the fold: server component, every loop is pure CSS (.hd-* in
 * globals.css). Reduced motion shows a complete static frame (all receipt
 * rows + final total; the first job card). Preview data is sample data and
 * says so. Agency fees = 20% of first-year salary (the site's stated
 * 15–25% range, midpoint).
 */

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, EyeOff } from "lucide-react";
import { DEMO_URL } from "@/lib/marketing/demo";
import { cn } from "@/lib/utils";

export function HeroDoors() {
  return (
    <div className="hd-doors grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-0 text-left">
      <Door
        tone="ink"
        delay={200}
        eyebrow="For dental groups"
        title="Hire across every practice."
        body="One flat subscription covers every location. Every hire after that costs you nothing extra."
        ticks={["Flat monthly fee", "No per-listing fees", "No placement fees"]}
        primary={{ label: "Explore dental group hiring", href: "/for-dental-groups" }}
        secondary={{ label: "See the live demo, no sign-up", href: DEMO_URL, external: true }}
        preview={<HiresReceipt />}
      />
      <Door
        tone="heritage"
        delay={280}
        eyebrow="For dental professionals"
        title="Find a role that fits you."
        body="Real openings at dental groups, each scored to how you actually like to work."
        ticks={["Free forever", "Apply direct", "Private from your office"]}
        primary={{ label: "Browse dental jobs", href: "/jobs" }}
        secondary={{ label: "How it works for candidates", href: "/for-candidates" }}
        preview={<JobsPreview />}
      />
    </div>
  );
}

function Door({
  tone,
  delay,
  eyebrow,
  title,
  body,
  ticks,
  primary,
  secondary,
  preview,
}: {
  tone: "ink" | "heritage";
  delay: number;
  eyebrow: string;
  title: string;
  body: string;
  ticks: string[];
  primary: { label: string; href: string };
  secondary: { label: string; href: string; external?: boolean };
  preview: React.ReactNode;
}) {
  const ink = tone === "ink";
  const linkCls =
    "inline-flex items-center gap-1.5 text-sm font-semibold text-ivory/75 hover:text-ivory transition-colors";
  return (
    <div
      className={cn(
        "hd-door mk-hero group relative isolate grid grid-cols-1 grid-rows-subgrid row-span-6 max-lg:mb-5 overflow-hidden text-ivory px-5 sm:px-9 pt-8 sm:pt-9 pb-6 sm:pb-9",
        ink ? "hd-door-ink" : "hd-door-green"
      )}
      style={{ "--mk-delay": `${delay}ms` } as React.CSSProperties}
    >
      <span aria-hidden className="hd-grid absolute inset-0 -z-10" />
      <span aria-hidden className="hd-glow absolute -z-10" />

      {/* row 1 */}
      <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-[1.6px] text-ivory/65">
        <span aria-hidden className={cn("hd-dot size-1.5", ink ? "bg-heritage-bright" : "bg-ivory")} />
        {eyebrow}
      </div>
      {/* row 2 */}
      <h2 className="mt-3 text-[1.7rem] sm:text-[2.1rem] font-extrabold tracking-[-0.035em] leading-[1.05] text-balance">
        {title}
      </h2>
      {/* row 3 */}
      <p className="mt-3 text-sm sm:text-base text-ivory/75 leading-[1.6] max-w-[460px] text-pretty">
        {body}
      </p>
      {/* row 4 */}
      <ul className="mt-4 flex flex-wrap content-start gap-x-4 gap-y-1.5 list-none">
        {ticks.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ivory/85">
            <Check aria-hidden className={cn("size-3.5", ink ? "text-heritage-bright" : "text-ivory")} strokeWidth={3} />
            {t}
          </li>
        ))}
      </ul>
      {/* row 5 — identical action pattern on both doors */}
      <div className="mt-6 flex flex-col items-start gap-3">
        <Link
          href={primary.href}
          className={cn(
            "btn-lift inline-flex items-center gap-2 px-5 py-3 text-sm font-bold bg-ivory hover:bg-ivory-deep",
            ink ? "text-ink" : "text-heritage-deep"
          )}
        >
          {primary.label}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
        {secondary.external ? (
          <a href={secondary.href} target="_blank" rel="noopener" className={linkCls}>
            {secondary.label}
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : (
          <Link href={secondary.href} className={linkCls}>
            {secondary.label}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {/* row 6 — the preview, fully inside the door */}
      <div aria-hidden className="hd-peek mt-8 self-end">
        {preview}
      </div>
    </div>
  );
}

function PreviewFrame({
  title,
  tag,
  children,
}: {
  title: React.ReactNode;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hd-window bg-ivory text-ink border border-ivory/25">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--rule)]">
        <span className="text-2xs font-extrabold text-ink truncate">{title}</span>
        <span className="text-2xs font-bold uppercase tracking-[1px] text-slate-meta shrink-0">{tag}</span>
      </div>
      {children}
    </div>
  );
}

/* ── Dental groups: the hires receipt ── */

const HIRES = [
  { role: "Associate Dentist", short: "Associate", loc: "Boise", agency: "$37,000" },
  { role: "Dental Hygienist", short: "Hygienist", loc: "Meridian", agency: "$21,000" },
  { role: "Office Manager", short: "Office mgr", loc: "Eagle", agency: "$14,400" },
  { role: "Dental Assistant", short: "Assistant", loc: "Nampa", agency: "$9,600" },
];
/* Running "kept vs. agency" after each row prints. */
const TOTALS = ["$37,000", "$58,000", "$72,400", "$82,000"];

function HiresReceipt() {
  return (
    <PreviewFrame
      title={
        <>
          Hires this quarter<span className="hidden sm:inline"> · 4 locations</span>
        </>
      }
      tag="Sample"
    >
      <div className="px-3.5 pt-2 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_3.6rem_3.9rem] gap-x-2.5 sm:gap-x-4 pb-1.5 text-2xs font-bold uppercase tracking-[0.9px] text-slate-meta">
          <span>Hire</span>
          <span className="text-right">Agency</span>
          <span className="text-right whitespace-nowrap">You paid</span>
        </div>
        <ul className="grid grid-cols-1 list-none">
          {HIRES.map((h, i) => (
            <li
              key={h.role}
              data-k={i}
              className="hd-row grid grid-cols-[minmax(0,1fr)_3.6rem_3.9rem] items-center gap-x-2.5 sm:gap-x-4 border-t border-[var(--rule)] py-[7px]"
            >
              <span className="min-w-0 flex items-center gap-2">
                <span className="hd-check hidden sm:grid place-items-center size-4 shrink-0 bg-heritage text-ivory">
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
                <span className="min-w-0 truncate text-xs font-bold text-ink">
                  <span className="sm:hidden">{h.short}</span>
                  <span className="hidden sm:inline">{h.role}</span>{" "}
                  <span className="hidden sm:inline lg:hidden xl:inline font-medium text-slate-meta">· {h.loc}</span>
                </span>
              </span>
              <span className="hd-strike relative text-xs font-semibold tabular text-slate-meta text-right">
                {h.agency}
              </span>
              <span className="text-xs font-extrabold tabular text-heritage-deep text-right">$0</span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex items-center justify-between gap-3 bg-hero px-3 py-2 text-ivory">
          <span className="text-2xs font-bold uppercase tracking-[1.1px] text-ivory/60">Kept vs. agency</span>
          <span className="relative inline-grid text-base font-extrabold tabular text-heritage-bright">
            <span data-k="z" className="hd-total [grid-area:1/1] text-right">
              $0
            </span>
            {TOTALS.map((t, i) => (
              <span key={t} data-k={i} className="hd-total [grid-area:1/1] text-right">
                {t}
              </span>
            ))}
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}

/* ── Candidates: job cards cycling, each scored ── */

const JOBS = [
  { title: "Associate Dentist", org: "Bridgeway Dental · Boise, ID", pay: "$750/day + 32%", fit: 94, label: "Excellent fit" },
  { title: "Dental Hygienist", org: "Summit Family Dental · Meridian, ID", pay: "$48–56/hr", fit: 91, label: "Excellent fit" },
  { title: "Office Manager", org: "Lakeside Smiles · Eagle, ID", pay: "$68k–78k", fit: 86, label: "Strong fit" },
];

const R = 19;
const C = 2 * Math.PI * R;

function JobsPreview() {
  return (
    <PreviewFrame
      title={
        <>
          Jobs for you<span className="hidden sm:inline"> · scored by PracticeFit</span>
        </>
      }
      tag="Sample"
    >
      <div className="hd-jobs-body flex flex-col px-3.5 pt-3 pb-3">
        {/* the stack: two cards tucked behind the live one */}
        <div className="relative h-[166px] shrink-0">
          <span className="absolute left-4 right-4 top-4 h-[150px] bg-card/60 border border-[var(--rule)]" />
          <span className="absolute left-2 right-2 top-2 h-[150px] bg-card/85 border border-[var(--rule)]" />
          {JOBS.map((j, i) => (
            <div
              key={j.title}
              data-k={i}
              className="hd-job absolute left-0 right-0 top-0 h-[150px] bg-card border border-[var(--rule)] p-3.5 shadow-[0_12px_28px_-18px_rgba(20,35,63,0.45)]"
              style={{ "--k": i, "--fit": j.fit } as React.CSSProperties}
            >
              <div className="flex items-start gap-3">
                <div className="relative size-[48px] shrink-0">
                  <svg viewBox="0 0 46 46" className="size-full -rotate-90">
                    <circle cx="23" cy="23" r={R} fill="none" strokeWidth="5" className="stroke-ink/[0.08]" />
                    <circle
                      cx="23"
                      cy="23"
                      r={R}
                      fill="none"
                      strokeWidth="5"
                      className="hd-ring stroke-heritage"
                      style={{ strokeDasharray: C, strokeDashoffset: C * (1 - j.fit / 100), "--c": C } as React.CSSProperties}
                    />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-xs font-extrabold tabular text-ink">
                    {j.fit}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-ink truncate">{j.title}</div>
                  <div className="text-2xs text-slate-meta truncate">{j.org}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2">
                    <span className="text-xs font-bold text-ink tabular">{j.pay}</span>
                    <span className="text-2xs font-bold text-heritage-deep">✦ {j.label}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center bg-heritage text-ivory px-1.5 py-0.5 text-2xs font-bold">
                  Apply direct
                </span>
                <span className="inline-flex items-center gap-1 border border-[var(--rule-strong)] px-1.5 py-0.5 text-2xs font-bold text-slate-body">
                  <EyeOff className="size-3" /> Hidden from your current office
                </span>
              </div>
            </div>
          ))}
        </div>
        {/* what the score is made of (practice track: 20 dimensions) */}
        <div className="mt-auto flex items-center justify-between gap-3 bg-heritage/10 px-3 py-2">
          <span className="text-2xs font-bold text-heritage-deep">✦ Scored on 20 dimensions</span>
          <span className="text-2xs text-slate-body truncate">schedule · pace · culture · commute · pay</span>
        </div>
      </div>
    </PreviewFrame>
  );
}
