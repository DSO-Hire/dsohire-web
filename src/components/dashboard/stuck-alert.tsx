/**
 * StuckAlert — conditional alert strip surfacing applications that have
 * been waiting on review (status='new') beyond the configured SLA.
 *
 * Only renders when there's at least one stuck application — when the
 * inbox is healthy, this widget vanishes. That's intentional: the
 * dashboard should give breathing room when things are working.
 *
 * Visual: amber-toned strip with a left rule, an alert icon, the headline
 * count + SLA threshold, up to 3 stuck-pill chips listing the most-overdue
 * candidates, and a "Review all" CTA that deep-links to the inbox filtered
 * to status=new + sorted by oldest first.
 *
 * The amber palette is the only place we step outside the locked
 * brand palette — warning intent doesn't have a heritage equivalent
 * that reads as "needs attention" at a glance, and this surface is
 * specifically designed to break the visual rhythm.
 */

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

interface StuckCandidate {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  locationName: string | null;
  daysWaiting: number;
}

interface StuckAlertProps {
  /** All stuck candidates, oldest first. */
  candidates: StuckCandidate[];
  /** Total stuck count (may exceed candidates.length when truncated). */
  totalCount: number;
  /** SLA threshold in days. Default 5. */
  slaDays?: number;
  /** Link to the filtered inbox listing all stuck candidates. */
  reviewAllHref?: string;
  /** Optional max number of pill chips to display. Default 3. */
  maxPills?: number;
}

export function StuckAlert({
  candidates,
  totalCount,
  slaDays = 5,
  reviewAllHref = "/employer/applications?stuck=1",
  maxPills = 3,
}: StuckAlertProps) {
  if (totalCount === 0 || candidates.length === 0) {
    return null;
  }

  const pillCandidates = candidates.slice(0, maxPills);

  return (
    <div className="bg-amber-50 border border-amber-100 border-l-4 border-l-amber-700 p-5 sm:p-6 mb-6">
      <div className="grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start">
        {/* Alert icon */}
        <div className="h-9 w-9 flex items-center justify-center flex-shrink-0 bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} />
        </div>

        {/* Body */}
        <div>
          <div className="text-[13px] font-extrabold leading-snug text-amber-900">
            {totalCount === 1
              ? "1 candidate has"
              : `${totalCount} candidates have`}{" "}
            been awaiting review for {slaDays}+ days.
          </div>
          <div className="text-[11px] mt-1 text-amber-700">
            SLA threshold: {slaDays} days · adjustable in Settings
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {pillCandidates.map((c) => (
              <Link
                key={c.applicationId}
                href={`/employer/applications/${c.applicationId}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-100 hover:bg-amber-100 transition-colors text-[11px] text-ink"
              >
                <span>
                  {c.candidateName} · {c.jobTitle}
                  {c.locationName && (
                    <>
                      {" "}
                      · <span className="text-slate-meta">{c.locationName}</span>
                    </>
                  )}
                </span>
                <span className="font-extrabold text-amber-700">
                  {c.daysWaiting}d
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Link
          href={reviewAllHref}
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-extrabold tracking-[1.6px] uppercase bg-amber-100 text-amber-900 hover:bg-white transition-colors flex-shrink-0"
        >
          Review all
          <ChevronRight className="h-2.5 w-2.5" strokeWidth={3} />
        </Link>
      </div>

      {/* Mobile CTA — full-width below body */}
      <Link
        href={reviewAllHref}
        className="sm:hidden mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-extrabold tracking-[1.6px] uppercase bg-amber-100 text-amber-900 hover:bg-white transition-colors"
      >
        Review all
        <ChevronRight className="h-2.5 w-2.5" strokeWidth={3} />
      </Link>
    </div>
  );
}
