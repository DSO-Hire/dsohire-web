/**
 * <JobHealth> — BOH Remodel Lane 2e (Day 32, Model 01).
 *
 * "Job health — funnel + freshness per opening": one row per active job
 * with its 30-day pipeline funnel, days-open, 7-day velocity spark, and
 * a health dot. Absorbs the old JobLeaderboard (same velocity data, plus
 * the funnel + health signals the model added). Server-safe.
 *
 * Health semantics (derived from data the dashboard already loads —
 * no new queries): hot = stale mid-pipeline candidates on this job;
 * warn = new applications past the first-response SLA; ok = neither.
 */

import Link from "next/link";

export interface JobHealthRow {
  id: string;
  title: string;
  subline: string;
  locationLabel: string | null;
  daysOpen: number | null;
  funnel: { open: number; screen: number; interview: number; offer: number };
  health: "ok" | "warn" | "hot";
  /** 7-day application spark, oldest first. */
  spark: number[];
  thisWeek: number;
  href: string;
}

const HEALTH_DOT: Record<JobHealthRow["health"], { cls: string; label: string }> = {
  ok: { cls: "bg-heritage", label: "Healthy" },
  warn: { cls: "bg-[#b07d2e]", label: "New apps past your response goal" },
  hot: { cls: "bg-[#b3543f]", label: "Stale candidates mid-pipeline" },
};

// Mini-kanban strip (Cam, Day 32 night: "what are the bars
// representing?") — the abstract bars are replaced with LABELED stage
// cells so the funnel reads without a legend. Same buckets, same data.
const FUNNEL_STEPS: Array<{
  key: keyof JobHealthRow["funnel"];
  label: string;
  full: string;
  cls: string;
}> = [
  { key: "open", label: "New", full: "New — awaiting review", cls: "bg-ink" },
  { key: "screen", label: "Screen", full: "Screening", cls: "bg-[#5d6b85]" },
  { key: "interview", label: "Int", full: "Interview", cls: "bg-heritage-light" },
  { key: "offer", label: "Offer", full: "Offer", cls: "bg-heritage" },
];

export function JobHealth({
  rows,
  viewAllHref,
}: {
  rows: JobHealthRow[];
  viewAllHref: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="border border-[var(--rule)] bg-white">
      <header className="px-5 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Job health — funnel + freshness per opening
        </span>
        <Link
          href={viewAllHref}
          className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors shrink-0"
        >
          Pipeline HQ →
        </Link>
      </header>
      <div>
        {rows.map((r) => {
          const dot = HEALTH_DOT[r.health];
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1.4fr_2fr_auto_auto] items-center gap-4 px-5 py-3 border-t border-[var(--rule)] first:border-t-0"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-extrabold tracking-[-0.2px] text-ink truncate">
                  {r.title}
                  {r.locationLabel && (
                    <span className="ml-2 text-[9px] font-bold tracking-[0.8px] uppercase text-slate-meta">
                      {r.locationLabel}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-meta mt-0.5">
                  {r.daysOpen != null ? `${r.daysOpen} days open · ` : ""}
                  {r.subline}
                  {r.thisWeek > 0 ? ` · ${r.thisWeek} apps this week` : ""}
                </div>
              </div>
              {/* Mini-kanban strip — labeled stage counts (last 30d).
                  Clicking lands on this job's pipeline board. */}
              <Link
                href={r.href}
                className="hidden sm:flex items-stretch gap-1 justify-self-start"
                aria-label={`Pipeline: ${r.funnel.open} new, ${r.funnel.screen} screening, ${r.funnel.interview} interview, ${r.funnel.offer} offer — open the board`}
              >
                {FUNNEL_STEPS.map((s) => {
                  const count = r.funnel[s.key];
                  return (
                    <span
                      key={s.key}
                      title={`${count} in ${s.full} (last 30 days)`}
                      className={`flex flex-col items-center min-w-[46px] border border-[var(--rule)] bg-white hover:bg-cream transition-colors ${
                        count === 0 ? "opacity-40" : ""
                      }`}
                    >
                      <span className={`h-[3px] w-full ${s.cls}`} />
                      <span className="text-[13px] font-extrabold text-ink leading-none pt-1.5 tabular-nums">
                        {count}
                      </span>
                      <span className="text-[7.5px] font-bold tracking-[1px] uppercase text-slate-meta pb-1 pt-0.5">
                        {s.label}
                      </span>
                    </span>
                  );
                })}
              </Link>
              <span
                className={`h-[9px] w-[9px] ${dot.cls}`}
                title={dot.label}
                aria-label={dot.label}
              />
              <Link
                href={r.href}
                className="text-[10px] font-bold tracking-[1px] uppercase text-heritage-deep hover:text-ink transition-colors"
              >
                Open
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
