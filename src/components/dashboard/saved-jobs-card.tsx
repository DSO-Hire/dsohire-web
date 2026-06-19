/**
 * SavedJobsCard — Day 35 (Direction A rail). The candidate's bookmarked
 * jobs they haven't applied to yet ("still exploring"). Compact by design;
 * a quiet nudge back into the funnel, never pushy.
 *
 * Privacy: shows job title + city/state only — never a practice name — so a
 * confidential/anonymous posting can't leak its employer here. Renders
 * nothing when there's nothing saved.
 *
 * Server-rendered — links only.
 */

import Link from "next/link";
import { Bookmark, ArrowRight } from "lucide-react";

export interface SavedJobItem {
  id: string;
  title: string;
  location: string | null;
}

export function SavedJobsCard({
  items,
  viewAllHref = "/candidate/applications?tab=saved",
}: {
  items: SavedJobItem[];
  viewAllHref?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <h3 className="mb-3.5 flex items-center gap-2 text-[10px] font-extrabold tracking-[2px] uppercase text-heritage-deep">
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
        Saved for later
      </h3>

      <div className="flex flex-col">
        {items.map((it, i) => (
          <Link
            key={it.id}
            href={`/jobs/${it.id}`}
            className={`group flex items-center gap-3 py-2.5 ${
              i < items.length - 1
                ? "border-b border-dashed border-[var(--rule)]"
                : ""
            }`}
          >
            <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-[#9fb0c4]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold leading-tight text-ink group-hover:text-heritage-deep transition-colors">
                {it.title}
              </div>
              {it.location && (
                <div className="text-[11.5px] text-slate-meta">{it.location}</div>
              )}
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-meta group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-meta">
        Exploring isn&apos;t applying — saved jobs stay private to you.
      </p>
      <Link
        href={viewAllHref}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
      >
        View all saved
      </Link>
    </section>
  );
}
