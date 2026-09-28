/**
 * DemoBand: the no-commitment rung between "reading about it" and "paying
 * for it". Links the self-serve read-only demo (DEMO_URL), which existed
 * since July but was never linked from the marketing site.
 *
 * The frame on the right is drawn in markup, not a screenshot, so it never
 * shows stale seed dates.
 */

import { ArrowUpRight, Check } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import { Button } from "@/components/ui/button";
import { DEMO_URL } from "@/lib/marketing/demo";

const INSIDE = [
  "A multi-location group with live roles at every office",
  "The pipeline your team would work, stage by stage",
  "PracticeFit scores with the plain-English why",
  "Offer approvals, comp guardrails, and analytics",
];

const TILES = [
  { k: "Awaiting review", v: "5", note: "sorted by who has waited longest" },
  { k: "Jobs live", v: "21", note: "across every location" },
  { k: "Time to fill", v: "10d", note: "median, posting to hire" },
];

export function DemoBand({ headline }: { headline?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-hero text-hero-foreground px-6 sm:px-14 py-24 sm:py-28 grain">
      <div
        aria-hidden
        className="absolute -right-[12%] top-1/2 -translate-y-1/2 w-[640px] h-[640px] pointer-events-none"
        style={{ background: "radial-gradient(circle, var(--heritage-glow), transparent 62%)" }}
      />
      <div className="relative max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-14 lg:gap-20 items-center">
        <div>
          <Eyebrow data-kick className="text-heritage-bright mb-3.5">
            The real product
          </Eyebrow>
          <h2
            data-reveal
            className="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.06] mb-5 text-balance"
          >
            {headline ?? (
              <>
                Walk the real back office.{" "}
                <span className="text-heritage-bright">No sign‑up, no sales call.</span>
              </>
            )}
          </h2>
          <p className="text-base text-hero-foreground/70 leading-[1.7] max-w-[520px] mb-8 text-pretty">
            One click signs you into a working dental group account with sample
            data. It&apos;s the actual app, read-only, so click anything you
            like.
          </p>
          <ul className="grid gap-3 mb-10 list-none">
            {INSIDE.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-[1.55]">
                <Check className="size-4 mt-0.5 shrink-0 text-heritage-bright" strokeWidth={3} />
                <span className="text-hero-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild variant="inverse" size="xl" className="btn-lift">
              <a href={DEMO_URL} target="_blank" rel="noopener">
                Open the live demo
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <span className="text-xs text-hero-foreground/50">
              Opens in a new tab · about 2 minutes to look around
            </span>
          </div>
        </div>

        {/* Product frame, drawn */}
        <div data-reveal style={{ "--mk-delay": "120ms" } as React.CSSProperties}>
          <div className="border border-ivory/15 bg-ivory/[0.04] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2 border-b border-ivory/10 px-4 py-3">
              <span className="size-2 bg-ivory/25" />
              <span className="size-2 bg-ivory/25" />
              <span className="size-2 bg-ivory/25" />
              <span className="ml-3 text-2xs tracking-[0.6px] text-hero-foreground/45 truncate">
                demo.dsohire.com/employer/dashboard
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[1.2px] text-heritage-bright">
                <span className="live-dot size-1.5 bg-heritage-bright" /> Live
              </span>
            </div>
            <div className="p-5 sm:p-7">
              <div className="text-2xs font-bold uppercase tracking-[1.5px] text-hero-foreground/45 mb-2">
                Sample group · all locations
              </div>
              <div className="text-lg sm:text-xl font-extrabold tracking-[-0.02em] mb-5">
                Good morning. Here&apos;s what needs you today.
              </div>
              <div className="grid grid-cols-3 gap-px bg-ivory/10 border border-ivory/10 mb-5">
                {TILES.map((t) => (
                  <div key={t.k} className="bg-hero p-3.5 sm:p-4">
                    <div className="text-2xs font-bold uppercase tracking-[1.1px] text-hero-foreground/45 mb-2 truncate">
                      {t.k}
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] tabular">
                      {t.v}
                    </div>
                    <div className="text-2xs text-hero-foreground/45 mt-1 leading-snug hidden sm:block">
                      {t.note}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { n: "Registered Dental Hygienist", fit: "Excellent fit", loc: "Aurora" },
                  { n: "Associate Dentist", fit: "Strong fit", loc: "Downtown" },
                  { n: "Dental Assistant", fit: "Strong fit", loc: "Lakewood" },
                ].map((r, i) => (
                  <div
                    key={r.n}
                    className="demo-row flex items-center gap-3 border border-ivory/10 bg-ivory/[0.03] px-3.5 py-2.5"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <span className="size-7 shrink-0 bg-heritage/60" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{r.n}</div>
                      <div className="text-2xs text-hero-foreground/45">New application · {r.loc}</div>
                    </div>
                    <span className="text-2xs font-bold px-2 py-1 bg-ivory text-ink whitespace-nowrap">
                      ✦ {r.fit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
