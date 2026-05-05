/**
 * JobLeaderboard — compact ranked list of jobs by 7-day application
 * velocity. Lives in the left half of the dashboard's two-column row,
 * paired with DashboardMiniMap on the right.
 *
 * Each row is a clickable Link to the job's applications page.
 * Visually it carries:
 *   - Rank (#1 is heritage-tinted; rest are slate-meta)
 *   - Job title + location/employment subline
 *   - Inline 7-day sparkline (heritage for healthy jobs, red for jobs
 *     trending DOWN week-over-week — the visual cue that something
 *     needs attention)
 *   - 7-day app count + delta pill (vs. prior 7 days)
 *   - Hover affordance: chevron translates, row gets a soft cream tint
 *
 * If the list is empty, the widget renders an empty-state message
 * pointing the operator at "Post a job".
 */

import Link from "next/link";
import { ChevronRight, Briefcase } from "lucide-react";
import { Sparkline } from "./sparkline";
import { TrendPill } from "./trend-pill";

export interface LeaderboardJob {
  id: string;
  title: string;
  /** Short context line: "Topeka · Full-time" */
  subline: string;
  /** 7-day spark series, oldest first. */
  spark: number[];
  /** Total 7-day applications. */
  thisWeek: number;
  /** Total 7-day applications for the prior week (for delta). */
  lastWeek: number;
  /** Direct link to the job's pipeline. */
  href: string;
}

interface JobLeaderboardProps {
  jobs: LeaderboardJob[];
  /** Title eyebrow. */
  title?: string;
  /** Link rendered in the header — "View all jobs". */
  viewAllHref?: string;
  /** Maximum rows to render. Default 5. */
  maxRows?: number;
}

export function JobLeaderboard({
  jobs,
  title = "Top Jobs · Last 7 Days",
  viewAllHref = "/employer/jobs",
  maxRows = 5,
}: JobLeaderboardProps) {
  const rows = jobs.slice(0, maxRows);

  return (
    <div className="bg-white border border-[var(--rule)] p-6 sm:p-7">
      <header className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
          {title}
        </h2>
        <Link
          href={viewAllHref}
          className="text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
        >
          View all jobs →
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="text-center py-10 px-4">
          <Briefcase
            className="h-6 w-6 text-slate-meta mx-auto mb-3"
            strokeWidth={1.5}
          />
          <div className="text-[13px] text-ink">No jobs yet.</div>
          <div className="text-[12px] text-slate-meta mt-1">
            Post your first to see it ranked here.
          </div>
        </div>
      ) : (
        <ul className="list-none -mx-7">
          {rows.map((j, i) => {
            const delta = j.thisWeek - j.lastWeek;
            const intent =
              delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
            const sparkStroke =
              delta < 0 ? "#b91c1c" : "var(--color-heritage, #4D7A60)";
            const sparkFill =
              delta < 0 ? "rgba(185,28,28,0.10)" : "rgba(77,122,96,0.12)";
            return (
              <li
                key={j.id}
                className={
                  i > 0 ? "border-t border-[var(--rule)]" : undefined
                }
              >
                <Link
                  href={j.href}
                  className="group grid grid-cols-[28px_1fr_auto_auto_16px] gap-3 sm:gap-4 items-center px-7 py-3 hover:bg-cream/40 transition-colors"
                >
                  <span
                    className={`text-[10px] font-extrabold tracking-[1.2px] ${
                      i === 0 ? "text-heritage" : "text-slate-meta"
                    }`}
                  >
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-ink leading-tight tracking-[-0.1px] truncate">
                      {j.title}
                    </div>
                    <div className="text-[10px] text-slate-meta tracking-[0.3px] mt-0.5">
                      {j.subline}
                    </div>
                  </div>
                  <Sparkline
                    data={j.spark}
                    width={80}
                    height={22}
                    stroke={sparkStroke}
                    fill={sparkFill}
                    showLastDot
                  />
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[16px] font-extrabold tracking-[-0.5px] text-ink leading-none">
                      {j.thisWeek}
                    </span>
                    {(j.thisWeek > 0 || j.lastWeek > 0) && (
                      <TrendPill delta={delta} intent={intent} />
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-meta group-hover:text-heritage group-hover:translate-x-1 transition-all" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
