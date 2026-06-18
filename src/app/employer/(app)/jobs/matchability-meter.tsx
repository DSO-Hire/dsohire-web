"use client";

/**
 * <MatchabilityMeter> — Lane 6 (Job Studio, Model 05). Renders the
 * result of computeClinicalMatchability under the live preview: an
 * "X of Y dimensions" bar, the scoreable set as quiet ✓ chips, and
 * each missing dimension with the EXACT field that unlocks it —
 * clickable when the owning wizard step is reachable.
 *
 * PracticeFit surface → the sparkle mark is allowed here (brand rule:
 * sparkle reserved for PracticeFit).
 */

import Link from "next/link";
import { Check } from "lucide-react";
import {
  FitWordmark,
  type FitProduct,
} from "@/components/practice-fit/brand/fit-wordmark";
import type {
  MatchabilityResult,
  MatchabilityStep,
} from "@/lib/practice-fit/matchability";

export function MatchabilityMeter({
  result,
  onJumpToStep,
  canJumpToStep,
  product = "practicefit",
}: {
  result: MatchabilityResult;
  /** Which fit product this posting scores under — drives mark + copy. */
  product?: FitProduct;
  /** Jump the wizard to the step that owns a missing field. */
  onJumpToStep?: (step: Exclude<MatchabilityStep, "profile" | "always">) => void;
  /** Step-guard from the wizard (forward jumps past unfilled required
   * fields stay blocked — same rule as the stepper). */
  canJumpToStep?: (
    step: Exclude<MatchabilityStep, "profile" | "always">
  ) => boolean;
}) {
  const missing = result.dims.filter((d) => !d.scoreable);
  const scoreable = result.dims.filter((d) => d.scoreable);
  const pct = Math.round((result.scoreable / result.total) * 100);

  return (
    <div className="border border-[var(--rule-strong)] bg-white">
      <div className="px-4 py-3 border-b border-[var(--rule)]">
        {/* Cam (Day 33): the branded wordmark headlines the box — the
            meter IS the fit product speaking, so let it sign its work.
            PracticeFit on the clinical wizard, DSOFit on corporate. */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-baseline gap-2">
            <FitWordmark product={product} className="text-[13px]" />
            <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
              Matchability
            </span>
          </span>
          <span className="text-[11px] font-bold text-ink tabular-nums">
            {result.scoreable} of {result.total} dimensions
          </span>
        </div>
        <div className="mt-2 h-1 bg-ivory-deep">
          <div
            className="h-full bg-heritage transition-[width] duration-300"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-meta">
          Every dimension this posting fills in gives{" "}
          {product === "dsofit" ? "DSOFit" : "PracticeFit"} more to work
          with — sharper Smart Picks, better placement in fit-sorted
          browsing.
        </p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {scoreable.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {scoreable.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-heritage-deep bg-heritage/10"
              >
                <Check className="h-2.5 w-2.5" aria-hidden />
                {d.label}
              </span>
            ))}
          </p>
        )}

        {missing.length > 0 && (
          <ul className="space-y-1.5">
            {missing.map((d) => {
              const jumpable =
                d.where !== "profile" &&
                d.where !== "always" &&
                onJumpToStep !== undefined &&
                (canJumpToStep?.(d.where) ?? true);
              return (
                <li key={d.key} className="text-[11px] leading-snug">
                  {d.where === "profile" ? (
                    <Link
                      href="/employer/settings/profile"
                      className="group/dim flex items-baseline gap-1.5"
                    >
                      <span className="font-bold text-slate-body group-hover/dim:text-ink shrink-0">
                        {d.label}
                      </span>
                      <span className="text-slate-meta group-hover/dim:text-slate-body underline-offset-2 group-hover/dim:underline">
                        {d.hint}
                      </span>
                    </Link>
                  ) : jumpable ? (
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToStep(
                          d.where as Exclude<
                            MatchabilityStep,
                            "profile" | "always"
                          >
                        )
                      }
                      className="group/dim flex items-baseline gap-1.5 text-left w-full"
                    >
                      <span className="font-bold text-slate-body group-hover/dim:text-ink shrink-0">
                        {d.label}
                      </span>
                      <span className="text-slate-meta group-hover/dim:text-slate-body underline-offset-2 group-hover/dim:underline">
                        {d.hint}
                      </span>
                    </button>
                  ) : (
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-bold text-slate-body shrink-0">
                        {d.label}
                      </span>
                      <span className="text-slate-meta">{d.hint}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
