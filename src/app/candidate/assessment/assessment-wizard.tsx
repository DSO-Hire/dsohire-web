"use client";

/**
 * PracticeFit v3 — the assessment wizard (Phase A).
 *
 * Section-by-section, mostly tap-to-answer, ~5 min. Part 1 (basics) is
 * pre-filled from the candidate's existing profile (which the résumé import
 * populates) and shown to confirm; Part 2 (deep) is always asked. A live
 * "match strength" meter climbs as they answer. Clinical-depth questions only
 * appear for clinical roles. Graceful for new grads / no résumé — every answer
 * set includes a positive "new / growing" option, never a dead end.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import {
  ASSESSMENT_QUESTIONS,
  PROCEDURES_BY_ROLE,
  CLINICAL_ROLES,
  questionsForRoles,
  type AssessmentQuestion,
  type AssessmentOption,
} from "@/lib/practice-fit/assessment/questions";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { saveAssessment } from "./actions";

type Answers = Record<string, unknown>;

const SECTION_ORDER = [
  "basics",
  "work_style",
  "clinical",
  "culture",
  "logistics",
  "open",
] as const;
const SECTION_LABEL: Record<string, string> = {
  basics: "The basics",
  work_style: "How you like to work",
  clinical: "Your clinical depth",
  culture: "Culture & environment",
  logistics: "Logistics & priorities",
  open: "Anything else",
};

export function AssessmentWizard({ initial }: { initial: Answers }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const roleValues = (answers.desired_roles as string[] | undefined) ?? [];

  // Questions visible for this candidate's roles, grouped into ordered sections.
  const sections = useMemo(() => {
    const qs = questionsForRoles(roleValues);
    return SECTION_ORDER.map((s) => ({
      id: s,
      label: SECTION_LABEL[s],
      questions: qs.filter((q) => q.section === s),
    })).filter((sec) => sec.questions.length > 0);
  }, [roleValues]);

  const step = sections[Math.min(stepIdx, sections.length - 1)]!;
  const isLast = stepIdx >= sections.length - 1;

  // Live "match strength" — share of non-optional questions answered.
  const { answered, total } = useMemo(() => {
    const all = questionsForRoles(roleValues).filter((q) => !q.optional);
    const done = all.filter((q) => isAnswered(answers[q.key])).length;
    return { answered: done, total: all.length };
  }, [answers, roleValues]);
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  const setAnswer = (key: string, value: unknown) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const next = () => {
    setError(null);
    if (isLast) {
      startSaving(async () => {
        const res = await saveAssessment(answers);
        if (!res.ok) return setError(res.error ?? "Couldn't save.");
        router.push("/candidate/practice-fit");
      });
      return;
    }
    setStepIdx((i) => i + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
    // #102 (Day 28) — scroll to top on Back too, mirroring next(), so each
    // section starts at the question stem instead of mid-page.
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-[680px]">
      {/* Brand + meter */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <PracticeFitWordmark surface="light" tm className="text-2xl" />
          <span className="text-[12px] font-bold uppercase tracking-[2px] text-slate-meta">
            assessment
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-heritage transition-all duration-300"
              style={{ width: `${Math.max(6, pct)}%` }}
            />
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-heritage-deep">
            <Sparkles className="h-3.5 w-3.5" />
            {pct}% match strength
          </span>
        </div>
        <p className="mt-2 text-[12px] text-slate-meta">
          Step {stepIdx + 1} of {sections.length} · {step.label}
        </p>
      </div>

      {/* Questions for this section */}
      <div className="space-y-7">
        {step.questions.map((q) => (
          <QuestionField
            key={q.key}
            q={q}
            answers={answers}
            roleValues={roleValues}
            onChange={setAnswer}
          />
        ))}
      </div>

      {error && (
        <div className="mt-5 border-l-4 border-red-500 bg-red-50 p-3 text-[13px] text-red-900">
          {error}
        </div>
      )}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={stepIdx === 0 || saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-slate-body hover:text-ink disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-ink px-6 py-3 text-[12px] font-bold uppercase tracking-[1.5px] text-ivory transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {isLast ? (saving ? "Saving…" : "See my matches") : "Continue"}
          {isLast ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function isAnswered(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Resolve procedure options for clinical questions from the selected roles. */
function procedureOptions(roleValues: string[]): AssessmentOption[] {
  const seen = new Set<string>();
  const out: AssessmentOption[] = [];
  for (const r of roleValues) {
    for (const opt of PROCEDURES_BY_ROLE[r] ?? []) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  }
  return out;
}

function QuestionField({
  q,
  answers,
  roleValues,
  onChange,
}: {
  q: AssessmentQuestion;
  answers: Answers;
  roleValues: string[];
  onChange: (key: string, value: unknown) => void;
}) {
  const value = answers[q.key];
  const options =
    q.section === "clinical" ? procedureOptions(roleValues) : q.options ?? [];

  return (
    <fieldset>
      <legend className="text-[15px] font-bold text-ink">
        {q.prompt}
        {q.optional && (
          <span className="ml-2 text-[12px] font-medium text-slate-meta">
            optional
          </span>
        )}
      </legend>
      {q.help && (
        <p className="mt-1 text-[13px] leading-relaxed text-slate-meta">{q.help}</p>
      )}

      <div className="mt-3">
        {q.type === "single" && (
          <div className="space-y-2">
            {options.map((opt) => {
              const active = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(q.key, opt.value)}
                  className={
                    "flex w-full items-center justify-between gap-3 border px-4 py-3 text-left text-[14px] transition-colors " +
                    (active
                      ? "border-heritage-deep bg-heritage/10 font-semibold text-ink"
                      : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
                  }
                >
                  {opt.label}
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-heritage-deep" />}
                </button>
              );
            })}
          </div>
        )}

        {q.type === "multi" && (
          <div className="flex flex-wrap gap-2">
            {options.length === 0 ? (
              <p className="text-[13px] italic text-slate-meta">
                No items for your role — skip ahead.
              </p>
            ) : (
              options.map((opt) => {
                const arr = (value as string[] | undefined) ?? [];
                const active = arr.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const nextArr = active
                        ? arr.filter((v) => v !== opt.value)
                        : [...arr, opt.value];
                      onChange(q.key, nextArr);
                    }}
                    className={
                      "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors " +
                      (active
                        ? "border-heritage-deep bg-heritage-deep text-ivory"
                        : "border-[var(--rule)] text-slate-body hover:border-heritage-deep")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        )}

        {q.type === "rank" && (
          <div className="space-y-2">
            {options.map((opt) => {
              const arr = (value as string[] | undefined) ?? [];
              const rank = arr.indexOf(opt.value);
              const active = rank >= 0;
              const full = arr.length >= 3 && !active;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={full}
                  onClick={() => {
                    const cur = (value as string[] | undefined) ?? [];
                    const at = cur.indexOf(opt.value);
                    const next =
                      at >= 0
                        ? cur.filter((v) => v !== opt.value)
                        : cur.length < 3
                          ? [...cur, opt.value]
                          : cur;
                    onChange(q.key, next);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-3 border px-4 py-3 text-left text-[14px] transition-colors " +
                    (active
                      ? "border-heritage-deep bg-heritage/10 font-semibold text-ink"
                      : full
                        ? "cursor-not-allowed border-[var(--rule)] bg-cream/40 text-slate-meta"
                        : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
                  }
                >
                  <span>{opt.label}</span>
                  {active && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-heritage-deep text-[12px] font-bold text-ivory">
                      {rank + 1}
                    </span>
                  )}
                </button>
              );
            })}
            <p className="text-[12px] text-slate-meta">
              Tap up to 3 in priority order — tap again to remove.
            </p>
          </div>
        )}

        {q.type === "slider" && (
          <div>
            <div className="flex items-center gap-3">
              <span className="w-28 text-right text-[12px] text-slate-meta">
                {q.sliderLabels?.low}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={typeof value === "number" ? value : 3}
                onChange={(e) => onChange(q.key, Number(e.target.value))}
                className="pf-slider flex-1"
              />
              <span className="w-28 text-[12px] text-slate-meta">
                {q.sliderLabels?.high}
              </span>
            </div>
          </div>
        )}

        {q.type === "salary" && (
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink">$</span>
            <input
              type="number"
              inputMode="numeric"
              value={typeof value === "number" ? value : ""}
              onChange={(e) =>
                onChange(q.key, e.target.value ? Number(e.target.value) : null)
              }
              placeholder="0"
              className="w-40 border border-[var(--rule)] bg-white px-3 py-2 text-[14px] text-ink focus:border-heritage focus:outline-none"
            />
            <select
              value={(answers.salary_unit as string | undefined) ?? "hourly"}
              onChange={(e) => onChange("salary_unit", e.target.value)}
              className="border border-[var(--rule)] bg-white px-2 py-2 text-[14px] text-ink focus:border-heritage focus:outline-none"
            >
              <option value="hourly">/ hour</option>
              <option value="yearly">/ year</option>
              <option value="per_day">/ day</option>
              <option value="per_visit">/ visit</option>
            </select>
          </div>
        )}

        {q.type === "text" && (
          <textarea
            value={(value as string | undefined) ?? ""}
            onChange={(e) => onChange(q.key, e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="A sentence or two — totally optional."
            className="w-full border border-[var(--rule)] bg-white px-3 py-2 text-[14px] text-ink focus:border-heritage focus:outline-none"
          />
        )}
      </div>
    </fieldset>
  );
}

void ASSESSMENT_QUESTIONS;
void CLINICAL_ROLES;
