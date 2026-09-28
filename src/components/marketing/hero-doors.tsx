/**
 * HeroDoors — the homepage's two front doors (v2, 2026-09-28).
 *
 * v1 was two flat color blocks with wireframe placeholder bars. Each door
 * is now a living preview in the same visual language as the back-office
 * showcase below it:
 *   • Dental groups: a mini Pipeline HQ peeks up from the door's bottom
 *     edge; Dr. Chen's card lifts, glides Screening → Interview, counts
 *     tick, the automation card slides in, on a quiet loop.
 *   • Candidates: a stack of job cards cycles, each with its PracticeFit
 *     ring drawing to its score and the direct-apply / privacy chips.
 *
 * Above the fold, so it must never wait for JavaScript: this is a server
 * component and every loop is pure CSS (globals.css, .hd-*). Reduced
 * motion: static first frame (Chen in Screening, first job card). Hovering
 * a door lifts it and raises its preview while the other recedes.
 *
 * Preview content is sample data and says so ("Sample"). Labels mirror
 * the product (stage names from stages.ts).
 */

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, EyeOff, Zap } from "lucide-react";
import { KIND_DEFAULT_LABELS } from "@/lib/applications/stages";
import { DEMO_URL } from "@/lib/marketing/demo";
import { cn } from "@/lib/utils";

export function HeroDoors() {
  return (
    <div className="hd-doors grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
      <Door
        tone="ink"
        delay={200}
        eyebrow="For dental groups"
        title="Hire across every practice."
        body="One flat subscription covers every location, with a pipeline built for how dental groups actually hire."
        ticks={["Flat monthly fee", "No per-listing fees", "No placement fees"]}
        primary={{ label: "Explore dental group hiring", href: "/for-dental-groups" }}
        secondary={{ label: "See the live demo, no sign-up", href: DEMO_URL, external: true }}
        preview={<PipelinePeek />}
      />
      <Door
        tone="heritage"
        delay={280}
        eyebrow="For dental professionals"
        title="Find a role that fits how you work."
        body="Real openings at dental groups, clinical and corporate, each scored to how you actually like to work."
        ticks={["Free forever", "Apply direct", "Private from your office"]}
        primary={{ label: "Browse dental jobs", href: "/jobs" }}
        secondary={{ label: "How it works for candidates", href: "/for-candidates" }}
        preview={<JobsPeek />}
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
  return (
    <div
      className={cn(
        "hd-door mk-hero group relative isolate flex flex-col overflow-hidden text-ivory",
        ink ? "hd-door-ink" : "hd-door-green"
      )}
      style={{ "--mk-delay": `${delay}ms` } as React.CSSProperties}
    >
      {/* texture + glow */}
      <span aria-hidden className="hd-grid absolute inset-0 -z-10" />
      <span aria-hidden className="hd-glow absolute -z-10" />

      <div className="relative px-7 pt-7 sm:px-9 sm:pt-9">
        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-[1.6px] text-ivory/65">
          <span aria-hidden className={cn("hd-dot size-1.5", ink ? "bg-heritage-bright" : "bg-ivory")} />
          {eyebrow}
        </div>
        <h2 className="mt-3 text-[1.7rem] sm:text-[2.1rem] font-extrabold tracking-[-0.035em] leading-[1.05] text-balance">
          {title}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-ivory/75 leading-[1.6] max-w-[440px] text-pretty">
          {body}
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 list-none">
          {ticks.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ivory/80">
              <Check aria-hidden className={cn("size-3.5", ink ? "text-heritage-bright" : "text-ivory")} strokeWidth={3} />
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={primary.href}
            className={cn(
              "btn-lift inline-flex items-center gap-2 px-5 py-3 text-sm font-bold",
              ink ? "bg-ivory text-ink hover:bg-ivory-deep" : "bg-ivory text-heritage-deep hover:bg-ivory-deep"
            )}
          >
            {primary.label}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
          {secondary.external ? (
            <a
              href={secondary.href}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ivory/75 hover:text-ivory transition-colors"
            >
              {secondary.label}
              <ArrowUpRight className="size-3.5" />
            </a>
          ) : (
            <Link
              href={secondary.href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ivory/75 hover:text-ivory transition-colors"
            >
              {secondary.label}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* The product, peeking up from the bottom edge */}
      <div aria-hidden className="hd-peek relative mt-auto pt-8 mx-7 sm:mx-9 -mb-6">
        {preview}
      </div>
    </div>
  );
}

/* ── Dental groups: a mini Pipeline HQ on a loop ── */

function MiniCard({
  name,
  role,
  fit,
  hero,
  className,
}: {
  name: string;
  role: string;
  fit: number;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hd-card relative h-[52px] min-w-0 bg-card border px-2.5 py-2 flex items-start justify-between gap-1.5",
        hero ? "border-heritage/60" : "border-[var(--rule)]",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-2xs font-bold text-ink truncate">{name}</div>
        <div className="text-2xs text-slate-meta truncate">{role}</div>
      </div>
      <span
        className={cn(
          "shrink-0 px-1 py-0.5 text-2xs font-bold tabular",
          hero ? "bg-heritage text-ivory" : "bg-heritage/12 text-heritage-deep"
        )}
      >
        ✦{fit}
      </span>
    </div>
  );
}

function Count({ from, to, className }: { from: number; to: number; className?: string }) {
  return (
    <span className={cn("hd-count relative inline-grid px-1.5 text-2xs font-bold tabular bg-card border border-[var(--rule)] text-slate-body", className)}>
      <span className="hd-count-a [grid-area:1/1]">{from}</span>
      <span className="hd-count-b [grid-area:1/1]">{to}</span>
    </span>
  );
}

function PipelinePeek() {
  return (
    <div className="hd-window bg-ivory text-ink border border-ivory/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--rule)]">
        <span className="text-2xs font-extrabold text-ink truncate">Pipeline HQ · all locations</span>
        <span className="inline-flex items-center gap-1 text-2xs font-extrabold uppercase tracking-[1px] text-heritage-deep">
          <span className="hd-dot size-1.5 bg-heritage" /> Live
        </span>
      </div>
      <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 pb-8">
        {/* Screening */}
        <div className="min-w-0">
          <div className="flex items-center justify-between px-0.5 pb-1.5">
            <span className="text-2xs font-extrabold uppercase tracking-[1px] truncate">{KIND_DEFAULT_LABELS.screen}</span>
            <Count from={5} to={4} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <div className="relative h-[52px]">
              <MiniCard name="Dr. Chen" role="Associate" fit={94} hero className="hd-mover absolute inset-0 z-10" />
            </div>
            <MiniCard name="Devon P." role="Office mgr" fit={83} />
          </div>
        </div>
        {/* Interview */}
        <div className="min-w-0">
          <div className="flex items-center justify-between px-0.5 pb-1.5">
            <span className="text-2xs font-extrabold uppercase tracking-[1px] truncate">{KIND_DEFAULT_LABELS.interview}</span>
            <Count from={3} to={4} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <div className="hd-slot h-[52px] border-2 border-dashed border-heritage/50 bg-heritage/[0.06]" />
            <MiniCard name="Aisha R." role="Hygienist" fit={87} />
          </div>
        </div>
        {/* Offer (phones show just the two columns the card moves between) */}
        <div className="min-w-0 hidden sm:block">
          <div className="flex items-center justify-between px-0.5 pb-1.5">
            <span className="text-2xs font-extrabold uppercase tracking-[1px] truncate">{KIND_DEFAULT_LABELS.offer}</span>
            <span className="px-1.5 text-2xs font-bold tabular bg-card border border-[var(--rule)] text-slate-body">1</span>
          </div>
          <MiniCard name="James R." role="Associate" fit={90} />
        </div>

        {/* automation card */}
        <div className="hd-toast absolute right-2.5 bottom-2 z-20 flex items-start gap-2 bg-hero text-ivory px-3 py-2 shadow-[0_18px_36px_-14px_rgba(7,15,28,0.6)] max-w-[88%]">
          <Zap className="size-3.5 mt-0.5 shrink-0 text-heritage-bright" />
          <div className="min-w-0">
            <div className="text-2xs font-extrabold uppercase tracking-[1px] text-heritage-bright">Automation fired</div>
            <div className="text-2xs font-semibold leading-snug">Interview prep + booking link sent</div>
          </div>
        </div>
      </div>
    </div>
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

function JobsPeek() {
  return (
    <div className="hd-window bg-ivory text-ink border border-ivory/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--rule)]">
        <span className="text-2xs font-extrabold text-ink truncate">Jobs for you<span className="hidden sm:inline"> · scored by PracticeFit</span></span>
        <span className="text-2xs font-bold uppercase tracking-[1px] text-slate-meta">Sample</span>
      </div>
      <div className="relative h-[172px] p-2.5">
        {/* ghost stack behind */}
        <span className="absolute left-5 right-5 top-5 h-[124px] bg-card/70 border border-[var(--rule)]" />
        <span className="absolute left-3.5 right-3.5 top-[14px] h-[124px] bg-card/85 border border-[var(--rule)]" />
        {JOBS.map((j, i) => (
          <div
            key={j.title}
            data-k={i}
            className="hd-job absolute left-2.5 right-2.5 top-2.5 bg-card border border-[var(--rule)] p-3 shadow-[0_12px_28px_-18px_rgba(20,35,63,0.45)]"
            style={{ "--k": i, "--fit": j.fit } as React.CSSProperties}
          >
            <div className="flex items-start gap-3">
              <div className="relative size-[46px] shrink-0">
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
                <div className="text-xs font-extrabold text-ink truncate">{j.title}</div>
                <div className="text-2xs text-slate-meta truncate">{j.org}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xs font-bold text-ink tabular">{j.pay}</span>
                  <span className="text-2xs font-bold text-heritage-deep">✦ {j.label}</span>
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 bg-heritage text-ivory px-1.5 py-0.5 text-2xs font-bold">
                Apply direct
              </span>
              <span className="inline-flex items-center gap-1 border border-[var(--rule-strong)] px-1.5 py-0.5 text-2xs font-bold text-slate-body">
                <EyeOff className="size-3" /> Hidden from your current office
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
