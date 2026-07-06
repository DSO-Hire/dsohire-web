/**
 * <ApplicationsList> — list-view rendering for the per-job applications surface.
 *
 * Extracted from src/app/employer/applications/page.tsx so the per-job page
 * (this directory) and the cross-job inbox can share the same row UI. The
 * cross-job inbox keeps its inline rendering for now to avoid churn; this
 * component is the canonical list row from Day 2 forward.
 *
 * Pure client component. No data fetching — caller passes everything in.
 *
 * Post-Track-B: keyed by stage_id + kind (the kind drives the badge color
 * + fallback label; per-DSO label comes from the passed `stages` list).
 */

"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  KIND_DEFAULT_COLORS,
  KIND_DEFAULT_LABELS,
  findStage,
  type PipelineStage,
  type StageKind,
} from "@/lib/applications/stages";
import { BrandMark } from "@/components/brand/brand-mark";
import { Eyebrow } from "@/components/brand/eyebrow";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";

export interface ApplicationsListItem {
  id: string;
  job_id: string;
  candidate_id: string;
  /** Stage row id (FK to dso_pipeline_stages). */
  stage_id: string;
  /** Stage kind snapshot at render time (open/screen/interview/...). */
  kind: StageKind;
  created_at: string;
  candidate: {
    full_name: string | null;
    current_title: string | null;
    headline: string | null;
    years_experience: number | null;
  } | null;
  jobTitle: string;
  /** PracticeFit (Phase 5D) — null when consent off OR not yet computed. */
  practiceFit?: import("@/lib/practice-fit/types").FitResult | null;
  /**
   * E2.10 — snapshotted prompts of knockout questions the candidate
   * failed. Empty array when no failures. Drives the kanban ⚠ chip.
   */
  knockoutFailedQuestions?: string[];
}

interface ApplicationsListProps {
  applications: ApplicationsListItem[];
  /** Full pipeline stage list for the DSO — drives per-DSO labels. */
  stages: PipelineStage[];
  /**
   * When true, hides the "Applied to {jobTitle}" sub-line because every row
   * is for the same job (per-job view). Defaults to false.
   */
  hideJobTitle?: boolean;
}

export function ApplicationsList({
  applications,
  stages,
  hideJobTitle = false,
}: ApplicationsListProps) {
  if (applications.length === 0) {
    return (
      <div className="border border-[var(--rule)] bg-card p-12 text-center max-w-[680px]">
        <BrandMark className="mx-auto mb-4 size-8 opacity-20" />
        <Eyebrow className="mb-3">No applications yet</Eyebrow>
        <p className="text-[15px] text-ink leading-relaxed">
          Share the apply link with your practice network — clinicians who
          apply land here the moment they submit.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] bg-card">
      {applications.map((app) => {
        const cand = app.candidate;
        const row = findStage(stages, app.stage_id);
        const label = row?.label ?? KIND_DEFAULT_LABELS[app.kind];
        return (
          <Link
            key={app.id}
            href={`/employer/applications/${app.id}`}
            className="block p-5 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <div className="text-[15px] font-bold text-ink truncate">
                    {cand?.full_name ?? "Anonymous candidate"}
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 ${statusBadgeClass(app.kind)}`}
                  >
                    {label}
                  </span>
                  {app.practiceFit && (
                    <PracticeFitChip fit={app.practiceFit} size="sm" />
                  )}
                </div>
                {!hideJobTitle && (
                  <div className="text-[14px] text-slate-body mb-2">
                    Applied to{" "}
                    <span className="font-semibold text-ink">{app.jobTitle}</span>
                  </div>
                )}
                <div className="text-[13px] text-slate-meta tabular">
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

/**
 * Stage badge rides the SAME brand stage ramp as the kanban columns
 * (KIND_DEFAULT_COLORS: stone → mist → navy → bronze → heritage · brick)
 * so list view and board view tell one chromatic story. Replaced the
 * old semantic-family mishmash (warning amber on screening, info blue
 * on interview) in the 2026-07-06 sweep — color is earned, and a stage
 * chip's semantic IS its position in the ramp.
 */
function statusBadgeClass(kind: StageKind): string {
  const triple = KIND_DEFAULT_COLORS[kind];
  return `${triple.bg} ${triple.text}`;
}
