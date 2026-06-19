/**
 * /changelog — every user-visible ship, as it lands (Day 32 port, Model 04).
 *
 * Pure render of src/content/changelog/ (see its index.ts for the
 * self-maintenance rule: entries are appended in the same commit as the
 * ship they describe — if it's on this page, it's live). "Last shipped"
 * is the newest entry's absolute date — computed, never typed, and never
 * a relative "today" that could go stale between deploys.
 *
 * Pre-launch this page is proof-of-momentum for charter customers and
 * diligence alike; post-launch it feeds the monthly ship-notes email.
 */

import { SiteShell } from "@/components/marketing/site-shell";
import {
  getChangelogMonths,
  getLastShipped,
  type ChangelogKind,
} from "@/content/changelog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every user-visible improvement to DSO Hire, as it ships. No vaporware — if it's on this page, it's live.",
};

const KIND_STYLES: Record<ChangelogKind, { label: string; className: string }> = {
  new: { label: "New", className: "text-heritage-deep bg-[var(--heritage-tint)]" },
  improved: { label: "Improved", className: "text-foreground bg-muted" },
  fixed: { label: "Fixed", className: "text-warning bg-warning-bg" },
};

export default function ChangelogPage() {
  const months = getChangelogMonths();
  const lastShipped = getLastShipped();
  return (
    <SiteShell>
      <Hero lastShipped={lastShipped} />
      <div className="max-w-[880px] mx-auto px-6 sm:px-14 pb-28">
        {months.map((m) => (
          <section key={m.key} className="pt-14">
            <div data-reveal className="flex items-baseline gap-3.5 mb-6">
              <h2 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
                {m.label}
              </h2>
              <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-meta">
                {m.entries.length} {m.entries.length === 1 ? "ship" : "ships"}
              </span>
            </div>
            {m.entries.map((e, i) => (
              <article
                key={`${e.date}-${e.title}`}
                data-reveal
                style={{ "--mk-delay": `${Math.min(i, 5) * 40}ms` } as React.CSSProperties}
                className="grid grid-cols-[88px_1fr] gap-4 py-4 border-t border-[var(--rule)]"
              >
                <time
                  dateTime={e.date}
                  className="text-[12px] font-bold text-slate-meta tabular-nums pt-0.5"
                >
                  {formatDay(e.date)}
                </time>
                <div>
                  <h3 className="text-[16.5px] font-extrabold tracking-[-0.2px] text-ink flex items-center gap-2.5 flex-wrap">
                    {e.title}
                    <span
                      className={`text-[8.5px] font-extrabold tracking-[1px] uppercase px-2 py-0.5 ${KIND_STYLES[e.kind].className}`}
                    >
                      {KIND_STYLES[e.kind].label}
                    </span>
                  </h3>
                  <p className="text-[13.5px] text-slate-body leading-[1.7] mt-1.5 max-w-[640px]">
                    {e.body}
                  </p>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </SiteShell>
  );
}

function Hero({ lastShipped }: { lastShipped: string }) {
  return (
    <section className="pt-[140px] pb-12 px-6 sm:px-14 border-b border-[var(--rule)]">
      <div className="max-w-[880px] mx-auto">
        <div data-reveal className="flex items-center gap-3.5 mb-8">
          <span className="block w-7 h-px bg-heritage" />
          <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
            Changelog
          </span>
        </div>
        <h1
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-6"
        >
          We ship <em className="not-italic text-heritage-light">constantly.</em>
          <br />
          Here&rsquo;s the receipt.
        </h1>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-lg text-slate-body leading-relaxed max-w-[560px] mb-7"
        >
          Every user-visible improvement to DSO Hire, as it lands. No
          vaporware, no &ldquo;coming soon&rdquo; — if it&rsquo;s on this
          page, it&rsquo;s live.
        </p>
        {lastShipped && (
          <div
            data-reveal
            style={
              {
                "--mk-delay": "200ms",
                background: "var(--heritage-tint)",
              } as React.CSSProperties
            }
            className="inline-flex items-center gap-2.5 border border-heritage/30 px-4 py-2.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-heritage opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
            </span>
            <span className="text-[10px] font-bold tracking-[1.6px] uppercase text-heritage-deep">
              Last shipped: {lastShipped}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function formatDay(iso: string): string {
  const [, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}
