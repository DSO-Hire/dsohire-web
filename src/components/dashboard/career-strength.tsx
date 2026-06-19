/**
 * <CareerStrength> — Lane 7 (Career HQ, Model 06). The profile-strength
 * ring paired with ONE computed next action. Replaces the onboarding
 * checklist on the candidate dashboard (component kept on disk).
 *
 * Honesty rules (locked):
 *   • ONE suggestion, biggest unlock first — never a guilt checklist.
 *   • Payoffs are qualitative and true ("sharpens schedule matching"),
 *     never invented counts.
 *   • The facts line only states things computed from the candidate's
 *     own real data, passed in by the page.
 *   • No streaks, no dark patterns; everything optional, nothing gates.
 *
 * Server-rendered — links only, no client state.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface NextAction {
  label: string;
  /** The payoff, named honestly. */
  payoff: string;
  href: string;
  ctaLabel: string;
}

export function CareerStrength({
  pct,
  facts,
  nextAction,
  compact = false,
}: {
  /** Profile strength 0–100 (completeness score). */
  pct: number;
  /** Short true statements from the candidate's own data. */
  facts: string[];
  /** The single computed suggestion — null when fully tuned. */
  nextAction: NextAction | null;
  /** Day 35 — rail variant: always stacks vertically to fit a narrow column. */
  compact?: boolean;
}) {
  // SVG ring: r=30, circumference ≈ 188.5.
  const C = 2 * Math.PI * 30;
  const filled = Math.max(0, Math.min(100, pct));
  const dash = (filled / 100) * C;

  return (
    <section
      className={
        compact
          ? "border border-[var(--rule)] bg-card p-5 flex flex-col items-start gap-4"
          : "border border-[var(--rule)] bg-card p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-7"
      }
    >
      {/* Strength ring */}
      <div className="relative shrink-0 h-[88px] w-[88px]" aria-hidden>
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke="var(--color-ivory-deep, #ECE7DB)"
            strokeWidth="7"
          />
          <circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke="var(--color-heritage, #4D7A60)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-extrabold tracking-[-0.5px] text-ink leading-none">
            {filled}%
          </span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Profile strength
        </p>
        {facts.length > 0 && (
          <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
            {facts.join(" · ")}
          </p>
        )}
        {nextAction ? (
          <div
            className={
              compact
                ? "mt-3 flex flex-col items-start gap-2"
                : "mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            }
          >
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-ink leading-snug">
                {nextAction.label}
              </p>
              <p className="text-[12px] text-slate-meta leading-snug">
                {nextAction.payoff}
              </p>
            </div>
            <Link
              href={nextAction.href}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
            >
              {nextAction.ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-[13px] font-semibold text-heritage-deep">
            Your profile is fully tuned — every match dimension is working
            for you.
          </p>
        )}
        <p className="mt-2 text-[10px] text-slate-meta">
          One suggestion at a time, biggest unlock first — your profile,
          your pace.
        </p>
      </div>
    </section>
  );
}
