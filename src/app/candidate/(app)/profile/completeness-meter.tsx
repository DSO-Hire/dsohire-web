"use client";

/**
 * <CompletenessMeter> — Phase 4.2.c All-Star analog.
 *
 * Pill-style tier indicator + a list of missing items, each with a
 * one-click "Add now" CTA that either opens the relevant section modal
 * or scrolls to the photo upload above the section editor.
 *
 * Mounted inside <ProfileSections> so the meter shares modal state with
 * the section cards. The orchestrator passes both `report` and an
 * `onOpenModal(modal)` callback; the meter calls back when the user
 * clicks a CTA whose target is `kind: "modal"`.
 *
 * Per locked rule R6: this is a CTA, never a shame state. Tone of copy
 * is gentle ("Looking good", "Almost All-Star"); never "Your profile is
 * incomplete." When the candidate hits All-Star, the meter celebrates.
 */

import { ChevronRight, Sparkles, CheckCircle2 } from "lucide-react";
import {
  TIER_META,
  type CompletenessReport,
  type ProfileSectionModal,
} from "@/lib/candidate/completeness";

interface CompletenessMeterProps {
  report: CompletenessReport;
  /** Called when the user clicks a CTA whose target is a modal. */
  onOpenModal: (modal: ProfileSectionModal) => void;
}

export function CompletenessMeter({
  report,
  onOpenModal,
}: CompletenessMeterProps) {
  const meta = TIER_META[report.tier];
  const pct = Math.round((report.score / report.total) * 100);

  // All-Star — celebrate.
  if (report.tier === "all_star") {
    return (
      <section className="border border-heritage/40 bg-gradient-to-br from-heritage/15 via-muted to-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-heritage text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[2.5px] text-heritage">
              {meta.label}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">
              Your profile is dialed in.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{meta.copy}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-border bg-card p-6 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[2.5px] text-heritage">
            Profile strength
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-foreground">
            {meta.label}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.copy}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-foreground">
            {report.score}
            <span className="text-sm font-normal text-meta-foreground">
              /{report.total}
            </span>
          </p>
          <p className="text-[10px] uppercase tracking-wider text-meta-foreground">
            steps done
          </p>
        </div>
      </header>

      {/* Five-segment progress bar so the tier visualization is legible
          at a glance even without reading the label. */}
      <div className="mt-4 flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((seg) => {
          const tierIndex =
            { beginner: 1, intermediate: 2, advanced: 3, expert: 4, all_star: 5 }[
              report.tier
            ];
          const filled = seg <= tierIndex;
          return (
            <div
              key={seg}
              className={`h-1.5 flex-1 rounded-full ${
                filled ? "bg-heritage" : "bg-muted"
              }`}
            />
          );
        })}
      </div>
      <p className="mt-1 text-right text-[10px] text-meta-foreground">
        {pct}% complete
      </p>

      {report.missing.length > 0 && (
        <>
          <p className="mt-5 text-sm font-medium text-foreground">
            Quick wins from here:
          </p>
          <ul className="mt-2 divide-y divide-border">
            {report.missing.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.ctaTarget.kind === "modal") {
                      onOpenModal(item.ctaTarget.modal);
                    } else {
                      const el = document.querySelector(
                        item.ctaTarget.selector
                      );
                      if (el && el instanceof HTMLElement) {
                        el.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                        // Brief flash to draw the eye.
                        el.classList.add("ring-2", "ring-heritage/60");
                        window.setTimeout(
                          () =>
                            el.classList.remove(
                              "ring-2",
                              "ring-heritage/60"
                            ),
                          1600
                        );
                      }
                    }
                  }}
                  className="group flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full bg-border group-hover:bg-heritage"
                      aria-hidden
                    />
                    {item.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-heritage group-hover:text-foreground">
                    Add now
                    <ChevronRight className="size-3.5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Items already done — collapsed by default. Surfaced as a tiny
          summary so candidates can see progress without it dominating
          the surface. */}
      {report.score > 0 && report.score < report.total && (
        <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3 text-heritage" />
          {report.score} of {report.total} done
          {report.missing.length === 1
            ? " — just one to go!"
            : ""}
        </p>
      )}
    </section>
  );
}
