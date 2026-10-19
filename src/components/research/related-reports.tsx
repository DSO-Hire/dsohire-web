/**
 * RelatedReports: a "Related research" block linking to other DSO Hire
 * Research reports. Pass report metadata from src/lib/research/reports.ts
 * so titles and slugs stay in one place.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import { researchPath, type ResearchReportMeta } from "@/lib/research/reports";

export function RelatedReports({
  reports,
  title = "Related research",
}: {
  reports: readonly ResearchReportMeta[];
  title?: string;
}) {
  if (reports.length === 0) return null;
  return (
    <aside
      aria-labelledby="related-research-heading"
      className="mt-16 sm:mt-20 max-w-[760px] border-t-2 border-ink pt-6"
    >
      <Eyebrow className="text-heritage-deep mb-2">DSO Hire Research</Eyebrow>
      <h2
        id="related-research-heading"
        className="text-xl sm:text-2xl font-extrabold tracking-[-0.03em] leading-[1.2] text-ink mb-4"
      >
        {title}
      </h2>
      <ul className="list-none border-t border-[var(--rule)]">
        {reports.map((r) => (
          <li key={r.slug} className="border-b border-[var(--rule)]">
            <Link
              href={researchPath(r.slug)}
              className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center py-4 hover:bg-card transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-base font-extrabold tracking-[-0.01em] text-ink leading-snug group-hover:text-heritage-deep transition-colors">
                  {r.title}
                </span>
                <span className="block mt-1 text-xs text-slate-meta">
                  {r.topic} · {r.dateLabel} · {r.readMinutes} min read
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 text-heritage-deep transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
