"use client";

/**
 * RecommendedQuestionsPanel — surfaces the curated screening question
 * library above the screening step of the job wizard / edit page.
 *
 * Behavior (Cam UX rework 2026-05-13 PM — "vanish on add" model):
 *   - Looks up recommendations by role_category (from src/lib/screening/question-library.ts).
 *   - Cards that are NOT yet in the wizard's questions array render here.
 *   - "Add" appends to the wizard's form state — the card immediately
 *     LEAVES this panel. There is no Added/✓ state surfaced here; the
 *     question is now visible (and editable) below in the QuestionCard
 *     list. Single source of truth for added questions.
 *   - "Skip" hides this card for the rest of the session — local state
 *     only, NOT persisted.
 *   - When all suggestions are added or skipped, the whole panel hides.
 *
 * Why the rework: the old "ADDED ✓" treatment + persistent card layout
 * created visual duplication — same question shown in the panel AND in
 * the editor list below. Vanishing on add removes the duplication and
 * makes the panel feel like it's doing work (cards disappear, count
 * drops, panel eventually clears).
 *
 * Dedup matching: a recommended card is considered "already added" if
 *   (a) this session added it (addedFromRec map), OR
 *   (b) the prompt text matches a question already in the wizard's
 *       array (case-insensitive + trimmed). (b) covers edit-page loads
 *       where the prior session's adds are now persisted DB rows.
 */

import { useMemo, useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getRecommendationsForRole,
  type QuestionCategory,
  type RecommendedQuestion,
} from "@/lib/screening/question-library";
import type {
  ScreeningQuestionKind,
  ScreeningQuestionOption,
  WizardScreeningQuestion,
} from "./job-wizard";

const KIND_LABELS: Record<ScreeningQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  number: "Number",
  scale: "Scale (slider)",
};

interface RecommendedQuestionsPanelProps {
  roleCategory: string;
  questions: WizardScreeningQuestion[];
  onChange: (qs: WizardScreeningQuestion[]) => void;
}

export function RecommendedQuestionsPanel({
  roleCategory,
  questions,
  onChange,
}: RecommendedQuestionsPanelProps) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const rec = useMemo(
    () => getRecommendationsForRole(roleCategory),
    [roleCategory]
  );

  /**
   * "Vanish on add" filter. A recommended card disappears from the panel
   * when EITHER:
   *   - the employer dismissed it this session (skipped set), OR
   *   - the question is already in the wizard's questions array (matched
   *     by prompt text, case-insensitive + trimmed). Covers session-adds
   *     and previously-persisted DB rows on the edit page.
   *
   * Computed inline (not memoized against `questions`) because the parent
   * passes a fresh array on every keystroke; memo would be noise.
   */
  const formPrompts = new Set(
    questions.map((q) => q.prompt.trim().toLowerCase())
  );
  const visible = rec.questions.filter(
    (q) =>
      !skipped.has(q.id) && !formPrompts.has(q.prompt.trim().toLowerCase())
  );

  /** Bucket the visible questions by category, preserving in-bank order. */
  const byCategory = useMemo(() => {
    const grouped: Record<QuestionCategory, RecommendedQuestion[]> = {
      qualification: [],
      experience: [],
      skills: [],
      logistics: [],
      compensation: [],
      fit: [],
    };
    for (const q of visible) {
      grouped[q.category].push(q);
    }
    return grouped;
  }, [visible]);

  if (visible.length === 0) {
    return null;
  }

  function buildWizardQuestion(
    rq: RecommendedQuestion,
    sortOrder: number
  ): WizardScreeningQuestion {
    const tmpId = `tmp_rec_${rq.id}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const options: ScreeningQuestionOption[] | null =
      rq.options &&
      (rq.kind === "single_select" ||
        rq.kind === "multi_select" ||
        rq.kind === "scale")
        ? rq.options.map((o) => ({ id: o.id, label: o.label }))
        : null;
    return {
      id: tmpId,
      persisted: false,
      prompt: rq.prompt,
      helper_text: rq.helper_text ?? null,
      kind: rq.kind,
      options,
      required: rq.required,
      sort_order: sortOrder,
    };
  }

  function handleAdd(rq: RecommendedQuestion) {
    const wq = buildWizardQuestion(rq, questions.length);
    onChange([...questions, wq]);
    // Vanish-on-add model — the card leaves the panel on its own once
    // the new question's prompt enters the wizard's array (see `visible`
    // filter above). No addedFromRec map needed; no scroll-to-next
    // dance — the next suggestion just slides up into its place.
  }

  function handleSkip(recId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(recId);
      return next;
    });
  }

  // Simplified tally: only "X suggestions remaining". The prior tally
  // ("0 added · 14 remaining · 2 skipped") existed because added cards
  // stayed on screen and we needed to communicate their state. With
  // vanish-on-add the count itself is the signal.
  const remainingCount = visible.length;

  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Recommended for {rec.label}
          </div>
          <p className="text-[13px] text-slate-meta leading-relaxed">
            Curated from competitor benchmarks and dental hiring best
            practices. Click Add — the question moves into your screening
            list below, where you can edit it.
          </p>
        </div>
        {/* Remaining-count chip. The panel auto-hides when this hits
            zero, so the chip never reads "0". Helps the employer see
            they're making progress as cards vanish. */}
        <div className="flex-shrink-0">
          <span className="inline-flex items-center px-2.5 py-1 bg-cream text-slate-meta border border-[var(--rule-strong)] text-[10px] font-bold tracking-[1.2px] uppercase">
            {remainingCount} suggestion{remainingCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const items = byCategory[category];
          if (items.length === 0) return null;

          return (
            <div key={category}>
              <div className="text-[13px] font-bold tracking-[2px] uppercase text-slate-meta mb-2.5 pb-1.5 border-b border-[var(--rule)]">
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-2.5">
                {items.map((rq) => (
                  <RecommendedCard
                    key={rq.id}
                    rq={rq}
                    onAdd={() => handleAdd(rq)}
                    onSkip={() => handleSkip(rq.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecommendedCard({
  rq,
  onAdd,
  onSkip,
}: {
  rq: RecommendedQuestion;
  onAdd: () => void;
  onSkip: () => void;
}) {
  const optionPreview =
    rq.options && rq.options.length > 0
      ? rq.options
          .slice(0, 3)
          .map((o) => o.label)
          .join(" · ") + (rq.options.length > 3 ? " · …" : "")
      : null;

  return (
    <div
      data-recid={rq.id}
      className="border border-[var(--rule-strong)] bg-white p-4 transition-colors scroll-mt-24"
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[13px] font-bold tracking-[2px] uppercase text-heritage-deep px-2 py-0.5 bg-heritage/[0.08]">
          {KIND_LABELS[rq.kind]}
        </span>
        {rq.knockout && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-red-700 px-2 py-0.5 bg-red-50 border border-red-200">
            <ShieldAlert className="h-3 w-3" />
            Knockout
          </span>
        )}
        {rq.required && (
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
            Required
          </span>
        )}
      </div>

      <p className="text-[14px] text-ink font-semibold leading-snug">
        {rq.prompt}
      </p>
      <p className="mt-1 text-[13px] text-slate-meta leading-relaxed italic">
        {rq.rationale}
      </p>
      {optionPreview && (
        <p className="mt-2 text-[12px] text-slate-body">
          <span className="text-slate-meta tracking-[0.3px] uppercase font-bold text-[10px] mr-1.5">
            Options
          </span>
          {optionPreview}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="ml-auto text-[12px] tracking-[0.5px] text-slate-meta hover:text-ink transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
