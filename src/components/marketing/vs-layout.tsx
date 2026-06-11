/**
 * VsLayout — #115 FOH-6 shared frame for the /vs comparison pages.
 *
 * NAMING RULE (locked Day 19): competitors stay GENERIC on public copy —
 * "per-listing job boards," "staffing agencies" — never named, never
 * slandered. These pages compare CATEGORY MECHANICS factually and are
 * honest about where the other category genuinely wins (that honesty is
 * the conversion device).
 *
 * Server-safe, no hooks; reveals ride the global [data-reveal] layer.
 */

import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";

export interface VsRow {
  dimension: string;
  them: string;
  us: string;
}

export function VsHero({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
}) {
  return (
    <section className="pt-[140px] pb-14 px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        {eyebrow}
      </div>
      <h1
        data-reveal
        style={{ "--mk-delay": "70ms" } as React.CSSProperties}
        className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5 max-w-[860px]"
      >
        {title}
      </h1>
      <p
        data-reveal
        style={{ "--mk-delay": "140ms" } as React.CSSProperties}
        className="text-lg text-slate-body leading-[1.7] max-w-[660px]"
      >
        {intro}
      </p>
    </section>
  );
}

export function VsTable({
  themLabel,
  rows,
}: {
  themLabel: string;
  rows: VsRow[];
}) {
  return (
    <section className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto">
      <div data-reveal className="border border-[var(--rule-strong)] overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse bg-white">
          <thead>
            <tr className="bg-ink text-ivory">
              <th className="text-left px-6 py-4 text-[10px] font-bold tracking-[2.5px] uppercase w-[26%]">
                What it means for you
              </th>
              <th className="text-left px-6 py-4 text-[10px] font-bold tracking-[2.5px] uppercase w-[37%] text-ivory/70">
                {themLabel}
              </th>
              <th className="text-left px-6 py-4 text-[10px] font-bold tracking-[2.5px] uppercase w-[37%] text-[var(--heritage-bright,#8db8a3)]">
                DSO Hire
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dimension} className="border-t border-[var(--rule)] align-top">
                <td className="px-6 py-5 text-[14px] font-extrabold tracking-[-0.2px] text-ink">
                  {r.dimension}
                </td>
                <td className="px-6 py-5 text-[14px] text-slate-body leading-[1.6]">
                  <span className="inline-flex gap-2">
                    <Minus className="h-3.5 w-3.5 text-slate-meta shrink-0 mt-1" aria-hidden />
                    <span>{r.them}</span>
                  </span>
                </td>
                <td className="px-6 py-5 text-[14px] text-slate-body leading-[1.6]" style={{ background: "var(--heritage-tint)" }}>
                  <span className="inline-flex gap-2">
                    <Check className="h-3.5 w-3.5 text-heritage-deep shrink-0 mt-1" aria-hidden />
                    <span>{r.us}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function VsHonestNote({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto">
      <div
        data-reveal
        className="max-w-[860px] border-l-2 border-heritage bg-cream/70 px-8 py-7"
      >
        <h2 className="text-[17px] font-extrabold tracking-[-0.3px] text-ink mb-2">
          {title}
        </h2>
        <p className="text-[14.5px] text-slate-body leading-[1.7]">{body}</p>
      </div>
    </section>
  );
}

export function VsCta({ headline, sub }: { headline: string; sub: string }) {
  return (
    <section className="bg-ink text-ivory px-6 sm:px-14 py-20">
      <div className="max-w-[820px] mx-auto text-center">
        <h2 data-reveal className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] mb-4">
          {headline}
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-base text-ivory/65 leading-[1.7] max-w-[540px] mx-auto mb-9"
        >
          {sub}
        </p>
        <div
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="flex flex-col sm:flex-row gap-3.5 justify-center"
        >
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            See Pricing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/switch"
            className="inline-flex items-center justify-center px-9 py-4 border border-ivory/30 text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:border-ivory hover:bg-white/5 transition-colors"
          >
            Free Migration
          </Link>
        </div>
      </div>
    </section>
  );
}
