"use client";

/**
 * Shared wizard shell — the TurboTax-style chrome extracted from the PracticeFit
 * assessment wizard (src/app/candidate/assessment/assessment-wizard.tsx) so every
 * multi-step flow (candidate apply, employer job creation, corporate) wears the
 * same face: a live progress meter, a "Step X of Y · label" line, one focused
 * step body at a time, and a consistent Back / Continue footer.
 *
 * PRESENTATION ONLY. The shell is fully controlled — the host wizard keeps its
 * own state, validation, drafts, and server actions and just hands the shell the
 * current step index + callbacks. This is the "same brains, new face" contract
 * that lets us re-skin the existing wizards without touching their logic.
 */

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";

export interface WizardStepMeta {
  id: string;
  /** Short label shown in the stepper + the "Step X of Y · label" line. */
  label: string;
}

export interface WizardShellProps {
  steps: WizardStepMeta[];
  /** Zero-based index of the visible step. */
  currentIndex: number;

  /**
   * Live completion meter (0-100). When omitted, the shell derives a step-based
   * percentage so every wizard still gets a moving bar. Pass an explicit value
   * for an assessment-style "match strength" / "profile completeness" meter.
   */
  progressPct?: number;
  /** Label next to the meter. Default "complete". */
  progressLabel?: string;
  /** Hide the meter entirely (rare — a few employer steps may not want it). */
  hideMeter?: boolean;
  /**
   * Icon shown next to the meter percentage. Defaults to the PracticeFit
   * sparkle. The DSO Hire wizards (apply, job creation) pass the BrandMark
   * D-form so the sparkle stays reserved for PracticeFit surfaces.
   */
  meterIcon?: ReactNode;

  /** Eyebrow above the meter — a wordmark, a label node, etc. Optional. */
  eyebrow?: ReactNode;
  /** Big step title rendered above the body. Optional (steps may render their own). */
  title?: ReactNode;
  /** Secondary line under the title. Optional. */
  subtitle?: ReactNode;

  /** Step body. */
  children: ReactNode;

  /** Footer nav. */
  onBack?: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  /** Footer primary label. Default "Continue"; final step often "Submit". */
  nextLabel?: string;
  /** Show a spinner-ish disabled state on the primary button. */
  busy?: boolean;
  /** Hide the Back button (e.g., first step). Defaults to hiding when currentIndex===0. */
  showBack?: boolean;

  /** Inline error shown above the footer. */
  error?: string | null;

  /**
   * Optional clickable stepper. Return true for steps the user may jump to
   * (the employer wizards allow jumping to any visited step). When provided and
   * onJump is set, the stepper chips become buttons.
   */
  canJumpTo?: (index: number) => boolean;
  onJump?: (index: number) => void;

  /** Max content width. Default 680px (the assessment width). */
  maxWidthClass?: string;
  /**
   * Tailwind `top-*` class controlling where the sticky header pins. Defaults
   * to "top-0". Hosts with a fixed top bar pass an offset (e.g. the candidate
   * apply flow passes "top-[64px] lg:top-0" to clear the mobile nav).
   */
  stickyTopClass?: string;
}

export function WizardShell({
  steps,
  currentIndex,
  progressPct,
  progressLabel = "complete",
  hideMeter = false,
  meterIcon,
  eyebrow,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  backDisabled,
  nextDisabled,
  nextLabel = "Continue",
  busy = false,
  showBack,
  error,
  canJumpTo,
  onJump,
  maxWidthClass = "max-w-[680px]",
  stickyTopClass = "top-0",
}: WizardShellProps) {
  const total = Math.max(1, steps.length);
  const clampedIndex = Math.min(Math.max(0, currentIndex), total - 1);
  const isLast = clampedIndex >= total - 1;
  const step = steps[clampedIndex];

  // Derive a step-based meter when no explicit percentage is supplied.
  const pct =
    progressPct != null
      ? Math.max(0, Math.min(100, Math.round(progressPct)))
      : Math.round(((clampedIndex + 1) / total) * 100);

  const backVisible = showBack ?? clampedIndex > 0;

  return (
    <div className={maxWidthClass}>
      {/* Eyebrow + meter — sticky so the candidate always sees their step + progress. */}
      <div
        className={
          "sticky z-20 mb-6 bg-ivory pb-3 pt-4 " + stickyTopClass
        }
      >
        {eyebrow != null && <div className="mb-2.5 flex items-center gap-2">{eyebrow}</div>}

        {!hideMeter && (
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-cream">
              <div
                className="h-full rounded-full bg-heritage transition-all duration-300"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-heritage-deep">
              {meterIcon ?? <Sparkles className="h-4 w-4" />}
              {pct}% {progressLabel}
            </span>
          </div>
        )}

        <p className="mt-2 text-[13px] text-slate-meta">
          Step {clampedIndex + 1} of {total}
          {step?.label ? <> · {step.label}</> : null}
        </p>

        {/* Optional clickable stepper (employer wizards). */}
        {canJumpTo && onJump && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {steps.map((s, i) => {
              const active = i === clampedIndex;
              const jumpable = canJumpTo(i) && i !== clampedIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!jumpable}
                  onClick={() => jumpable && onJump(i)}
                  className={
                    "rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[1px] transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : jumpable
                        ? "bg-cream text-slate-body hover:bg-heritage/10 hover:text-ink"
                        : "bg-cream/50 text-slate-meta")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Title / subtitle */}
      {(title != null || subtitle != null) && (
        <header className="mb-6">
          {title != null && (
            <h1 className="text-xl font-bold leading-tight tracking-[-0.4px] text-ink sm:text-2xl">
              {title}
            </h1>
          )}
          {subtitle != null && (
            <p className="mt-3 text-base text-slate-body">{subtitle}</p>
          )}
        </header>
      )}

      {/* Step body */}
      <div className="space-y-7">{children}</div>

      {/* Error */}
      {error && (
        <div className="mt-5 border-l-4 border-danger bg-danger-bg p-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* Footer nav — FOH-2 (Day 32, Model 08 audit): on phones the primary
          action is a full-width thumb-zone bar with Back beneath it
          (column-reverse keeps the primary visually first); ≥sm restores
          the Back-left / Continue-right desktop row. */}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={!backVisible || backDisabled || busy}
          className={
            "inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2.5 text-[13px] font-semibold text-slate-body transition-colors hover:text-ink disabled:opacity-30 " +
            (backVisible ? "" : "hidden sm:inline-flex sm:invisible")
          }
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-primary px-6 py-3.5 sm:py-3 text-[12px] font-bold uppercase tracking-[1.5px] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Saving…" : nextLabel}
          {isLast ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
