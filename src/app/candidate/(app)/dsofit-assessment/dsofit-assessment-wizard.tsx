"use client";

/**
 * DSOFit assessment wizard — the corporate-side sibling of the PracticeFit
 * assessment. Reuses the shared wizard shell + field primitives; renders the
 * DSOFit question bank section-by-section and saves to the candidate's DSOFit
 * signal columns. Heritage-green branded (PracticeFit = navy).
 *
 * First-timers see a landing with an optional résumé upload (#41 parity): drop
 * a résumé → we parse it, SAVE it to the profile + the file, prefill what we
 * can, and drop into the questions. Re-takers skip straight to the questions.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, UploadCloud, Check } from "lucide-react";
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
// #41 parity — résumé autofill on the landing: parse once, save the file +
// profile, then drop into the assessment. Reuses the profile-import parser.
import {
  parseResumeAction,
  saveParsedResumeAction,
} from "@/app/candidate/(app)/profile/import/actions";

type Answers = Record<string, unknown>;

const SALARY_UNITS = [
  { value: "yearly", label: "per year" },
  { value: "hourly", label: "per hour" },
];

export function DsoFitAssessmentWizard({
  initial,
  completedBefore = false,
}: {
  initial: Answers;
  /** Re-takers skip the landing and go straight to the questions. */
  completedBefore?: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial ?? {});
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [started, setStarted] = useState(completedBefore);

  // Résumé landing state.
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);
  // Soft skip nudge — first tap makes the case for staying, second tap lets
  // them leave anyway (never a hard gate).
  const [skipNudge, setSkipNudge] = useState(false);

  const sections = DSOFIT_SECTION_ORDER;
  const steps = sections.map((s) => ({ id: s, label: DSOFIT_SECTION_LABEL[s] }));
  const section = sections[stepIdx];
  const sectionQuestions = useMemo(
    () => DSOFIT_QUESTIONS.filter((q) => q.section === section),
    [section]
  );

  const progress = useMemo(() => {
    const required = DSOFIT_QUESTIONS.filter((q) => !q.optional);
    const answered = required.filter((q) => isAnswered(q, answers)).length;
    return required.length ? Math.round((answered / required.length) * 100) : 0;
  }, [answers]);

  useEffect(() => {
    if (started) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIdx, started]);

  const set = (key: string, val: unknown) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  async function autofillFromResume() {
    if (!resumeFile || parsing) return;
    setParsing(true);
    setAutofillNote(null);
    try {
      const fd = new FormData();
      fd.set("resume", resumeFile);
      const res = await parseResumeAction(fd);
      if (!res.ok) {
        setAutofillNote(
          res.errorCode === "cap_exceeded"
            ? "You've imported a résumé recently — your details are already saved. Just hit Start."
            : res.error ||
                "We couldn't read that résumé. You can start and fill it in as you go."
        );
        return;
      }
      // Save the whole parse to the profile + the file (reused everywhere).
      await saveParsedResumeAction(res.parsed);
      // Best-effort prefill of the current title (drives function-fit) — read
      // defensively so an unexpected parser shape can't break the flow.
      const p = res.parsed as unknown as {
        basics?: { current_title?: { value?: string | null } };
        work_history?: Array<{ title?: { value?: string | null } }>;
      };
      const parsedTitle =
        p.basics?.current_title?.value ?? p.work_history?.[0]?.title?.value ?? null;
      if (parsedTitle) setAnswers((a) => ({ ...a, current_title: parsedTitle }));
      setStarted(true);
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setAutofillNote("Something went wrong reading that résumé.");
    } finally {
      setParsing(false);
    }
  }

  // ── Landing (first-timers) ──
  if (!started) {
    return (
      <div className="mx-auto max-w-[700px]">
        <div className="mb-5">
          <DsoFitWordmark className="text-3xl sm:text-4xl" tm />
        </div>
        <h1 className="text-[26px] sm:text-[31px] font-extrabold tracking-[-0.5px] leading-tight text-ink mb-3">
          The fit score DSOs see — built in 5 minutes.
        </h1>
        <p className="text-[15px] sm:text-[16px] text-slate-body leading-relaxed mb-6 max-w-[580px]">
          DSOFit ranks every open DSO and corporate role by how well it fits
          your function, level, multi-site experience, and how you want to
          work — the things a résumé can&apos;t show. Take it once and you&apos;ll:
        </p>
        <ul className="space-y-3 mb-8">
          {[
            "See DSO & corporate roles ranked for you — strongest matches first.",
            "Get surfaced to DSOs hiring for your function, by fit — not keywords.",
            "Save your résumé to your profile and apply in one click.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-[15px] text-slate-body">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-heritage/15">
                <Check className="h-3.5 w-3.5 text-heritage-deep" />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {/* Prominent résumé drop-zone — the time-saver, hard to miss. */}
        <div className="border-2 border-dashed border-heritage/45 bg-cream/50 rounded-xl p-7 mb-6 text-center">
          <UploadCloud className="mx-auto mb-2 h-8 w-8 text-heritage-deep" />
          <div className="text-[16px] font-extrabold text-ink">
            Drop your résumé to save time
          </div>
          <p className="mx-auto mt-1 mb-4 max-w-[420px] text-[13px] text-slate-meta">
            We&apos;ll save it to your profile and pre-fill what we can. PDF or
            Word — totally optional.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-heritage-deep bg-card px-5 py-2.5 text-[14px] font-bold text-heritage-deep hover:bg-heritage/5 transition-colors">
            {resumeFile ? "Choose a different file" : "Choose your résumé"}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {resumeFile && (
            <div className="mt-4">
              <div className="mb-3 text-[13px] text-slate-body">
                Selected: <span className="font-semibold text-ink">{resumeFile.name}</span>
              </div>
              <button
                type="button"
                onClick={autofillFromResume}
                disabled={parsing}
                className="inline-flex items-center gap-2 rounded-full bg-heritage-deep px-6 py-2.5 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {parsing ? "Reading your résumé…" : "Use this résumé & start →"}
              </button>
            </div>
          )}
          {autofillNote && (
            <p className="mt-3 text-[12px] text-slate-meta">{autofillNote}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-[15px] font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Start without a résumé →
          </button>
          {!skipNudge ? (
            <button
              type="button"
              onClick={() => setSkipNudge(true)}
              className="text-[13px] text-slate-meta hover:text-ink hover:underline underline-offset-2"
            >
              Skip for now
            </button>
          ) : null}
        </div>

        {/* Soft skip nudge — make the case once, then let them go. */}
        {skipNudge && (
          <div className="mt-5 rounded-xl border border-heritage/30 bg-cream/50 p-5">
            <p className="text-[14px] font-bold text-ink">
              You can skip — but it&apos;s only about 5 minutes, and it&apos;s
              what powers everything.
            </p>
            <p className="mt-1.5 text-[13px] text-slate-body leading-relaxed max-w-[520px]">
              Without it, we can&apos;t rank DSO roles for you or surface you to
              DSOs hiring for your function — those stay dark until you finish.
              It&apos;s mostly taps, and you can stop anytime.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSkipNudge(false);
                  setStarted(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-heritage-deep px-5 py-2.5 text-[14px] font-bold text-primary-foreground hover:bg-heritage transition-colors"
              >
                Take 5 minutes →
              </button>
              <Link
                href="/candidate/dashboard"
                className="text-[13px] text-slate-meta hover:text-ink hover:underline underline-offset-2"
              >
                Skip anyway
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

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
        // Drop into the DSOFit hub (their ranked matches) — parity with the
        // PracticeFit assessment's "see my matches" landing, not the dashboard.
        router.push("/candidate/dsofit");
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
    case "salary": {
      // Display with thousands separators (150,000); store the raw digits.
      const rawSalary = (answers.min_salary as string) ?? "";
      const displaySalary = rawSalary
        ? Number(rawSalary).toLocaleString("en-US")
        : "";
      return (
        <div className="flex flex-wrap items-center gap-3">
          <TextField
            value={displaySalary}
            onChange={(v) => set("min_salary", v.replace(/[^0-9]/g, ""))}
            type="text"
            inputMode="numeric"
            prefix="$"
            placeholder="e.g. 150,000"
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
    }
    default:
      return null;
  }
}
