/**
 * StatusProgress — small horizontal step indicator showing how far an
 * application has progressed through the hiring pipeline.
 *
 * Used on /candidate/applications row cards (and could surface elsewhere,
 * e.g., the candidate-side application detail page) to give candidates a
 * clear visual of where they sit in the funnel — "Submitted, in review,
 * scheduled for interview, offer received, hired."
 *
 * Five canonical kinds, plus terminal states for rejected/withdrawn:
 *   - submitted (kind='open')
 *   - reviewed (kind='screen')
 *   - interviewing (kind='interview')
 *   - offered (kind='offer')
 *   - hired (kind='hired')
 *   - rejected / withdrawn → render the strip with all stages dim and a
 *     terminal pill at the end
 *
 * Caller passes the stage *kind* (system category) — not stage_id —
 * because the per-DSO label/color is rendered by the kanban; here we want
 * a candidate-friendly canonical funnel regardless of DSO customizations.
 */

import { Check } from "lucide-react";

interface StatusProgressProps {
  /** Stage kind: open/screen/interview/offer/hired/rejected/withdrawn. */
  status: string;
  /**
   * When true (employer set hide_stages_from_candidate=true on the job),
   * the strip renders an abstracted "In review" label until the
   * application reaches Offer or Hired (terminal-positive stages where
   * abstraction adds no protection and just confuses the candidate).
   * Closed-state (rejected / withdrawn) is shown as normal.
   */
  hideStages?: boolean;
}

// Candidate-friendly funnel labels (Option A locked 2026-05-12 PM).
// Keep in sync with CANDIDATE_KIND_LABELS in @/lib/applications/stages.
const STAGES: { key: string; label: string }[] = [
  { key: "open", label: "Submitted" },
  { key: "screen", label: "Reviewed" },
  { key: "interview", label: "Interviewing" },
  { key: "offer", label: "Offer extended" },
  { key: "hired", label: "Hired" },
];

export function StatusProgress({ status, hideStages }: StatusProgressProps) {
  const isClosed = status === "rejected" || status === "withdrawn";
  const currentIndex = STAGES.findIndex((s) => s.key === status);

  // Abstracted "In review" mode — employer hid stage detail. We keep the
  // 5-dot strip rendered (so layout matches everywhere else) but with
  // every dot dim and a single "In review" pill at the end.
  // Exception: Offer and Hired are positive outcomes, so we always
  // surface those even when hideStages is on. Closed states render
  // normally below.
  if (
    hideStages &&
    !isClosed &&
    status !== "offer" &&
    status !== "hired"
  ) {
    return (
      <div className="flex items-center gap-1.5">
        {STAGES.map((stage) => (
          <div key={stage.key} className="flex items-center gap-1.5">
            <span className="block w-1.5 h-1.5 rounded-full bg-border" />
          </div>
        ))}
        <span className="ml-2 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
          In review
        </span>
      </div>
    );
  }

  if (isClosed) {
    const closedLabel = status === "rejected" ? "Not selected" : "Withdrawn";
    return (
      <div className="flex items-center gap-1.5">
        {STAGES.map((stage) => (
          <div key={stage.key} className="flex items-center gap-1.5">
            <span className="block w-1.5 h-1.5 rounded-full bg-border" />
          </div>
        ))}
        <span className="ml-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {closedLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const isPast = currentIndex > i;
        const isCurrent = currentIndex === i;
        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            {isPast ? (
              <span className="flex items-center justify-center w-3.5 h-3.5 bg-heritage text-primary-foreground">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            ) : isCurrent ? (
              <span className="relative flex items-center justify-center w-3.5 h-3.5">
                <span className="absolute inset-0 bg-heritage animate-pulse opacity-30" />
                <span className="relative w-2 h-2 bg-heritage" />
              </span>
            ) : (
              <span className="block w-1.5 h-1.5 rounded-full bg-border" />
            )}
            {isCurrent && (
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep ml-0.5">
                {stage.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
