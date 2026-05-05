/**
 * <ApplicationsList> — list-view rendering for the per-job applications surface.
 *
 * Extracted from src/app/employer/applications/page.tsx so the per-job page
 * (this directory) and the cross-job inbox can share the same row UI. The
 * cross-job inbox keeps its inline rendering for now to avoid churn; this
 * component is the canonical list row from Day 2 forward.
 *
 * Pure client component. No data fetching — caller passes everything in.
 */

"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { STAGE_LABELS, type ApplicationStatus } from "@/lib/applications/stages";

export interface ApplicationsListItem {
  id: string;
  job_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  created_at: string;
  candidate: {
    full_name: string | null;
    current_title: string | null;
    headline: string | null;
    years_experience: number | null;
  } | null;
  jobTitle: string;
}

interface ApplicationsListProps {
  applications: ApplicationsListItem[];
  /**
   * When true, hides the "Applied to {jobTitle}" sub-line because every row
   * is for the same job (per-job view). Defaults to false.
   */
  hideJobTitle?: boolean;
}

export function ApplicationsList({
  applications,
  hideJobTitle = false,
}: ApplicationsListProps) {
  if (applications.length === 0) {
    return (
      <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          No applications yet
        </div>
        <p className="text-[15px] text-ink leading-relaxed">
          Once candidates start applying, they&rsquo;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] bg-white">
      {applications.map((app) => {
        const cand = app.candidate;
        return (
          <Link
            key={app.id}
            href={`/employer/applications/${app.id}`}
            className="block p-5 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="text-[15px] font-bold text-ink truncate">
                    {cand?.full_name ?? "Anonymous candidate"}
                  </div>
                  <span
                    className={`text-[9px] font-bold tracking-[1.5px] uppercase px-2.5 py-1 ${statusBadgeClass(app.status)}`}
                  >
                    {STAGE_LABELS[app.status] ?? app.status}
                  </span>
                </div>
                {!hideJobTitle && (
                  <div className="text-[14px] text-slate-body mb-2">
                    Applied to{" "}
                    <span className="font-semibold text-ink">{app.jobTitle}</span>
                  </div>
                )}
                <div className="text-[13px] text-slate-meta">
                  {[cand?.current_title, cand?.headline]
                    .filter(Boolean)
                    .join(" · ") || "Profile minimal"}
                  {cand?.years_experience !== null &&
                    cand?.years_experience !== undefined && (
                      <> &middot; {cand.years_experience} yr exp</>
                    )}
                  {" · "}Applied{" "}
                  {new Date(app.created_at).toLocaleDateString()}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-meta flex-shrink-0 mt-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function statusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case "new":
      return "bg-cream text-ink";
    case "reviewed":
      return "bg-amber-50 text-amber-900";
    case "interviewing":
      return "bg-blue-50 text-blue-900";
    case "offered":
    case "hired":
      return "bg-emerald-50 text-emerald-900";
    case "rejected":
    case "withdrawn":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-cream text-ink";
  }
}
