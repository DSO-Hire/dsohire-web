/**
 * ApplicationJourneys — Lane 7 (Career HQ, Model 06). The candidate's
 * active applications as visual JOURNEYS: the stage stepper that until
 * now only employers saw, plus one honest status line per application.
 *
 * Replaces MyApplicationStages (kanban-lite, kept on disk) on the
 * candidate dashboard.
 *
 * Locked candidate-side rules carried forward:
 *   • NO "days waiting in stage" — anxiety without action (2026-05-05).
 *     The applied date is fine (their own action); stage dwell is not.
 *   • hide_stages_from_candidate → the journey collapses to
 *     Applied → In review → Offer → Hired; the employer's specific
 *     pipeline never leaks.
 *   • Candidate-friendly labels only ("Reviewed", not internal jargon).
 *   • Response medians are real per-practice medians (≥5 sample gate,
 *     computed in lib/applications/response-medians.ts) — when there's
 *     no honest number, we say nothing rather than something vague.
 *
 * Status line priority: offer pending → unread message → median line.
 */

import Link from "next/link";
import { Check, MessageCircle, Star } from "lucide-react";

export interface ApplicationJourney {
  id: string;
  /** Job title. */
  role: string;
  /** Masked-safe DSO display name (affiliation resolver output). */
  dsoName: string;
  locationName?: string | null;
  stage: "open" | "screen" | "interview" | "offer" | "hired";
  /** Days since the candidate applied (their own action — allowed). */
  daysSinceApplied: number;
  /** Employer's per-job stage-visibility toggle. */
  hideStages: boolean;
  hasUnreadMessage: boolean;
  offerPending: boolean;
  /** Median days-to-first-response for this practice, or null (gated). */
  medianResponseDays: number | null;
  href: string;
}

const FULL_STEPS = [
  { key: "open", label: "Applied" },
  { key: "screen", label: "Reviewed" },
  { key: "interview", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
] as const;

// hide_stages collapses the employer's pipeline into one abstract
// "In review" step. Offer/Hired stay — the candidate experiences those
// directly, there's nothing to hide.
const ABSTRACT_STEPS = [
  { key: "open", label: "Applied" },
  { key: "review", label: "In review" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
] as const;

const STAGE_ORDER: Record<ApplicationJourney["stage"], number> = {
  open: 0,
  screen: 1,
  interview: 2,
  offer: 3,
  hired: 4,
};

export function ApplicationJourneys({
  journeys,
  viewAllHref = "/candidate/applications",
}: {
  journeys: ApplicationJourney[];
  viewAllHref?: string;
}) {
  if (journeys.length === 0) return null;
  return (
    <div className="bg-white border border-[var(--rule)] p-5 sm:p-7">
      <header className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
            Your applications — as journeys
          </h2>
          <div className="text-[12px] text-slate-meta mt-1">
            Where each one stands, start to finish.
          </div>
        </div>
        <Link
          href={viewAllHref}
          className="text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
        >
          All applications →
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        {journeys.map((j) => (
          <JourneyRow key={j.id} journey={j} />
        ))}
      </div>
    </div>
  );
}

/* ───── Subcomponents ───── */

function JourneyRow({ journey: j }: { journey: ApplicationJourney }) {
  const abstracted =
    j.hideStages && (j.stage === "screen" || j.stage === "interview");
  const steps = abstracted ? ABSTRACT_STEPS : FULL_STEPS;
  // Index of the current step within whichever track we render.
  const currentIdx = abstracted
    ? 1 // "In review"
    : STAGE_ORDER[j.stage];

  return (
    <Link
      href={j.href}
      className="block bg-cream hover:bg-ivory-deep transition-colors p-4 sm:p-5 border-l-[3px] border-l-heritage"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-[13px] font-bold text-ink leading-tight">
            {j.role}
          </span>
          <span className="text-[11px] text-slate-meta tracking-[0.3px]">
            {" "}
            — {j.dsoName}
            {j.locationName ? ` · ${j.locationName}` : ""}
          </span>
        </div>
        <span className="text-[10px] text-slate-meta tracking-[0.3px] shrink-0">
          applied {appliedLabel(j.daysSinceApplied)}
        </span>
      </div>

      {/* Stepper */}
      <div className="mt-3 flex items-center" aria-hidden>
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div
              key={step.key}
              className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`grid place-items-center h-5 w-5 rounded-full border text-[9px] font-extrabold ${
                    done
                      ? "bg-heritage border-heritage text-ivory"
                      : current
                        ? "bg-white border-heritage text-heritage-deep ring-2 ring-heritage/25"
                        : "bg-white border-rule-strong text-slate-meta"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className={`text-[8.5px] font-bold tracking-[0.8px] uppercase whitespace-nowrap ${
                    current
                      ? "text-heritage-deep"
                      : done
                        ? "text-slate-body"
                        : "text-slate-meta"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-[2px] mx-1.5 mb-4 ${
                    i < currentIdx ? "bg-heritage" : "bg-rule-strong"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ONE honest status line */}
      <StatusLine journey={j} />
    </Link>
  );
}

function StatusLine({ journey: j }: { journey: ApplicationJourney }) {
  if (j.offerPending) {
    return (
      <p className="mt-2.5 text-[12px] text-ink flex items-center gap-1.5">
        <Star className="h-3 w-3 text-heritage shrink-0" aria-hidden />
        <span>
          <strong className="font-bold">Offer extended</strong> — review and
          respond when you&apos;re ready.
        </span>
      </p>
    );
  }
  if (j.hasUnreadMessage) {
    return (
      <p className="mt-2.5 text-[12px] text-ink flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3 text-heritage shrink-0" aria-hidden />
        <span>
          <strong className="font-bold">New message</strong> from the hiring
          team — open to read it.
        </span>
      </p>
    );
  }
  // Waiting stages: the honest median, or silence.
  if (
    (j.stage === "open" || j.stage === "screen") &&
    j.medianResponseDays != null
  ) {
    return (
      <p className="mt-2.5 text-[12px] text-slate-body">
        In review — this practice typically responds within{" "}
        <strong className="font-bold text-ink">
          ~{j.medianResponseDays} day{j.medianResponseDays === 1 ? "" : "s"}
        </strong>{" "}
        <span className="text-slate-meta">(their real response pattern)</span>
      </p>
    );
  }
  return null;
}

/* ───── Helpers ───── */

function appliedLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
