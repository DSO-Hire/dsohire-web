/**
 * StalePipelineAlert — conditional strip surfacing candidates parked in a
 * mid-pipeline stage (Screening / Interview / Offer) past the stale
 * threshold (E3.24).
 *
 * Deliberately distinct from StuckAlert:
 *   - StuckAlert (amber)  = NEW applications you haven't reviewed yet,
 *     keyed on created_at vs. a short SLA.
 *   - StalePipelineAlert (slate) = candidates you DID start working but
 *     who've sat in their current stage too long, keyed on
 *     stage_entered_at vs. a longer threshold.
 *
 * The slate palette keeps it visually subordinate to the amber new-app
 * SLA — this is a "nudge to follow up," not an "inbox on fire" warning —
 * so the two never compete for the same alarm color. Renders nothing when
 * no candidate is stale, matching the dashboard's quiet-when-healthy rule.
 */

import Link from "next/link";
import { Clock, ChevronRight } from "lucide-react";

interface StaleCandidate {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  locationName: string | null;
  daysWaiting: number;
  stageLabel: string;
}

interface StalePipelineAlertProps {
  candidates: StaleCandidate[];
  totalCount: number;
  thresholdDays?: number;
  reviewAllHref?: string;
  maxPills?: number;
}

export function StalePipelineAlert({
  candidates,
  totalCount,
  thresholdDays = 14,
  reviewAllHref = "/employer/applications?stale=1",
  maxPills = 3,
}: StalePipelineAlertProps) {
  if (totalCount === 0 || candidates.length === 0) {
    return null;
  }

  const pillCandidates = candidates.slice(0, maxPills);

  return (
    <div className="bg-cream border border-[var(--rule-strong)] border-l-4 border-l-slate-body p-5 sm:p-6 mb-6">
      <div className="grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start">
        <div className="h-9 w-9 flex items-center justify-center flex-shrink-0 bg-ivory-deep text-slate-body">
          <Clock className="h-4 w-4" strokeWidth={2} />
        </div>

        <div>
          <div className="text-[13px] font-extrabold leading-snug text-ink">
            {totalCount === 1
              ? "1 candidate has"
              : `${totalCount} candidates have`}{" "}
            been in the same stage for {thresholdDays}+ days.
          </div>
          <div className="text-[11px] mt-1 text-slate-meta">
            Follow up or move them forward so good people don&apos;t go cold.
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {pillCandidates.map((c) => (
              <Link
                key={c.applicationId}
                href={`/employer/applications/${c.applicationId}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-[var(--rule-strong)] hover:bg-ivory-deep transition-colors text-[11px] text-ink"
              >
                <span>
                  {c.candidateName} ·{" "}
                  <span className="text-slate-meta">{c.stageLabel}</span> ·{" "}
                  {c.jobTitle}
                </span>
                <span className="font-extrabold text-slate-body">
                  {c.daysWaiting}d
                </span>
              </Link>
            ))}
          </div>
        </div>

        <Link
          href={reviewAllHref}
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-extrabold tracking-[1.6px] uppercase bg-ivory-deep text-ink hover:bg-card transition-colors flex-shrink-0"
        >
          Review all
          <ChevronRight className="h-2.5 w-2.5" strokeWidth={3} />
        </Link>
      </div>

      <Link
        href={reviewAllHref}
        className="sm:hidden mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-extrabold tracking-[1.6px] uppercase bg-ivory-deep text-ink hover:bg-card transition-colors"
      >
        Review all
        <ChevronRight className="h-2.5 w-2.5" strokeWidth={3} />
      </Link>
    </div>
  );
}
