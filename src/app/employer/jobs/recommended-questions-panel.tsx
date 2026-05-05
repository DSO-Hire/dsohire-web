"use client";

/**
 * RecommendedQuestionsPanel — surfaces the curated screening question
 * library above the empty-state of the job posting wizard's screening step.
 *
 * Behavior:
 *   - Looks up recommendations by role_category (from src/lib/screening/question-library.ts).
 *   - "Add" appends the recommended question to the wizard's form state and
 *     marks the card as Added (✓), so the employer sees what's already in.
 *   - "Add and edit" appends + asks the parent to scroll/focus the new
 *     question (via `onFocusQuestion`).
 *   - "Skip" hides this single card for the rest of the session — local
 *     state only, NOT persisted.
 *
 * Recommendations are ADDITIVE — they share form state with manually-added
 * questions so the existing flow is untouched.
 */

import { useMemo, useState } from "react";
import { Plus, Pencil, Check, ShieldAlert } from "lucide-react";
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
};

interface RecommendedQuestionsPanelProps {
  roleCategory: string;
  questions: WizardScreeningQuestion[];
  onChange: (qs: WizardScreeningQuestion[]) => void;
  onFocusQuestion?: (id: string) => void;
}

export function RecommendedQuestionsPanel({
  roleCategory,
  questions,
  onChange,
  onFocusQuestion,
}: RecommendedQuestionsPanelProps) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [addedFromRec, setAddedFromRec] = useState<
    Record<string, string>
  >({});

  const rec = useMemo(
    () => getRecommendationsForRole(roleCategory),
    [roleCategory]
  );

  /** Filter out cards the employer dismissed for this session. */
  const visible = rec.questions.filter((q) => !skipped.has(q.id));

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
      rq.options && (rq.kind === "single_select" || rq.kind === "multi_select")
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

  function handleAdd(rq: RecommendedQuestion, focusAfter: boolean) {
    const wq = buildWizardQuestion(rq, questions.length);
    onChange([...questions, wq]);
    setAddedFromRec((prev) => ({ ...prev, [rq.id]: wq.id }));
    if (focusAfter && onFocusQuestion) {
      // Defer to next tick so the DOM has the new card
      setTimeout(() => onFocusQuestion(wq.id), 0);
    }
  }

  function handleSkip(recId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(recId);
      return next;
    });
  }

  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Recommended for {rec.label}
          </div>
          <p className="text-[13px] text-slate-meta leading-relaxed">
            We curated these from competitor benchmarks and dental hiring best
            practices. One click to add — keep, customize, or skip each one.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const items = byCategory[category];
          if (items.length === 0) return null;

          return (
            <div key={category}>
              <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2.5 pb-1.5 border-b border-[var(--rule)]">
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-2.5">
                {items.map((rq) => {
                  const addedId = addedFromRec[rq.id];
                  const stillInForm =
                    addedId !== undefined &&
                    questions.some((q) => q.id === addedId);
                  const isAdded = !!addedId && stillInForm;

                  return (
                    <RecommendedCard
                      key={rq.id}
                      rq={rq}
                      added={isAdded}
                      onAdd={() => handleAdd(rq, false)}
                      onAddAndEdit={() => handleAdd(rq, true)}
                      onSkip={() => handleSkip(rq.id)}
                    />
                  );
                })}
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
  added,
  onAdd,
  onAddAndEdit,
  onSkip,
}: {
  rq: RecommendedQuestion;
  added: boolean;
  onAdd: () => void;
  onAddAndEdit: () => void;
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
      className={
        "border p-4 transition-colors " +
        (added
          ? "border-heritage bg-heritage/[0.06]"
          : "border-[var(--rule-strong)] bg-white")
      }
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep px-2 py-0.5 bg-heritage/[0.08]">
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
        {added && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
            <Check className="h-3 w-3" />
            Added
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
        {!added && (
          <>
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
              onClick={onAddAndEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Add & edit
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="ml-auto text-[12px] tracking-[0.5px] text-slate-meta hover:text-ink transition-colors"
            >
              Skip
            </button>
          </>
        )}
        {added && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto text-[12px] tracking-[0.5px] text-slate-meta hover:text-ink transition-colors"
          >
            Hide
          </button>
        )}
      </div>
    </div>
  );
}
