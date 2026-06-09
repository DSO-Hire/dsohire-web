"use client";

/**
 * DSOFit assessment wizard — the corporate-side sibling of the PracticeFit
 * assessment. Reuses the shared wizard shell + field primitives; renders the
 * DSOFit question bank section-by-section and saves to the candidate's DSOFit
 * signal columns. Heritage-green branded (PracticeFit = navy).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { WizardShell } from "@/components/wizard/wizard-shell";
import {
  FieldShell,
  OptionCards,
  MultiChips,
  TextField,
  SelectField,
} from "@/components/wizard/wizard-fields";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import {
  DSOFIT_QUESTIONS,
  DSOFIT_SECTION_ORDER,
  DSOFIT_SECTION_LABEL,
  type DsoFitQuestion,
} from "@/lib/practice-fit/assessment/questions-dsofit";
import { saveDsoFitAssessment } from "./actions";

type Answers = Record<string, unknown>;

const SALARY_UNITS = [
  { value: "yearly", label: "per year" },
  { value: "hourly", label: "per hour" },
];

export function DsoFitAssessmentWizard({ initial }: { initial: Answers }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial ?? {});
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sections = DSOFIT_SECTION_ORDER;
  const steps = sections.map((s) => ({ id: s, label: DSOFIT_SECTION_LABEL[s] }));
  const section = sections[stepIdx];
  const sectionQuestions = useMemo(
    () => DSOFIT_QUESTIONS.filter((q) => q.section === section),
    [section]
  );

  // Match-strength meter: answered required questions / total required.
  const progress = useMemo(() => {
    const required = DSOFIT_QUESTIONS.filter((q) => !q.optional);
    const answered = required.filter((q) => isAnswered(q, answers)).length;
    return required.length ? Math.round((answered / required.length) * 100) : 0;
  }, [answers]);

  // Scroll to top of the body on every section change (reliable, post-render).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIdx]);

  const set = (key: string, val: unknown) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  const isLast = stepIdx === sections.length - 1;

  function next() {
    setError(null);
    if (!isLast) {
      setStepIdx((i) => i + 1);
      return;
    }
    startTransition(async () => {
      const res = await saveDsoFitAssessment(answers);
      if (res.ok) {
        router.push("/candidate/dashboard");
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't save — try again.");
      }
    });
  }

  function back() {
    setError(null);
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  return (
    <WizardShell
      steps={steps}
      currentIndex={stepIdx}
      progressPct={progress}
      progressLabel="match strength"
      meterIcon={<Building2 className="h-4 w-4 text-heritage-deep" />}
      eyebrow={<DsoFitWordmark className="text-lg" tm />}
      title={DSOFIT_SECTION_LABEL[section]}
      onBack={stepIdx > 0 ? back : undefined}
      onNext={next}
      nextLabel={isLast ? (pending ? "Saving…" : "See my matches") : "Continue"}
      busy={pending}
      error={error ?? undefined}
    >
      <div className="space-y-7">
        {sectionQuestions.map((q) => (
          <FieldShell key={q.key} label={q.prompt} help={q.help} optional={q.optional}>
            {renderField(q, answers, set)}
          </FieldShell>
        ))}
      </div>
    </WizardShell>
  );
}

function isAnswered(q: DsoFitQuestion, answers: Answers): boolean {
  const v = answers[q.key];
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  return typeof v === "string" ? v.trim().length > 0 : v != null;
}

function renderField(
  q: DsoFitQuestion,
  answers: Answers,
  set: (key: string, val: unknown) => void
) {
  switch (q.type) {
    case "multi":
      return (
        <MultiChips
          value={(answers[q.key] as string[]) ?? []}
          onChange={(v) => set(q.key, v)}
          options={q.options ?? []}
        />
      );
    case "single":
      return (
        <OptionCards
          value={(answers[q.key] as string) ?? null}
          onChange={(v) => set(q.key, v)}
          options={q.options ?? []}
        />
      );
    case "text":
      return (
        <TextField
          value={(answers[q.key] as string) ?? ""}
          onChange={(v) => set(q.key, v)}
          placeholder="Type here…"
          maxLength={120}
        />
      );
    case "salary":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <TextField
            value={(answers.min_salary as string) ?? ""}
            onChange={(v) => set("min_salary", v.replace(/[^0-9]/g, ""))}
            type="text"
            inputMode="numeric"
            prefix="$"
            placeholder="e.g. 150000"
            widthClass="w-[180px]"
          />
          <SelectField
            value={(answers.salary_unit as string) ?? "yearly"}
            onChange={(v) => set("salary_unit", v)}
            options={SALARY_UNITS}
            widthClass="w-[150px]"
          />
        </div>
      );
    default:
      return null;
  }
}
