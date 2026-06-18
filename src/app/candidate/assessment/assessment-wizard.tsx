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

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
// #41 (Day 28) — résumé autofill on the landing: parse once, then fill BOTH
// this assessment and the candidate's profile (saveParsedResumeAction writes
// the profile + the file is saved for reuse). Reuses the profile-import parser.
import {
  parseResumeAction,
  saveParsedResumeAction,
} from "@/app/candidate/profile/import/actions";

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

export function AssessmentWizard({
  initial,
  completedBefore = false,
}: {
  initial: Answers;
  /** #94 (Day 28) — true if the candidate has finished the assessment before.
   *  Re-takers skip the landing/intro and go straight into the questions. */
  completedBefore?: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // First-timers see a landing screen explaining PracticeFit before the
  // questions (Cam: jumping straight into the questionnaire felt strange).
  const [started, setStarted] = useState(completedBefore);
  // Soft skip nudge — first tap makes the case for staying, second tap leaves
  // (never a hard gate). Mirrors the DSOFit assessment landing.
  const [skipNudge, setSkipNudge] = useState(false);

  // #41 (Day 28) — résumé autofill on the landing.
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);

  // Map a parsed résumé's value into this candidate's profile-derived
  // assessment years bucket (mirrors yearsBucket() in page.tsx).
  const yearsBucketFromNumber = (n: number | null): string | null => {
    if (n == null) return null;
    if (n <= 0) return "new_grad";
    if (n < 2) return "lt2";
    if (n <= 5) return "2_5";
    if (n <= 10) return "6_10";
    return "10_plus";
  };

  const autofillFromResume = async () => {
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
            ? "You've imported a résumé recently — your saved details are already on your profile. Just hit Start."
            : res.error ||
                "We couldn't read that résumé. You can start and fill it in as you go."
        );
        return;
      }
      const parsed = res.parsed;
      // Persist the whole profile (roles, specialty, PMS, years, work history,
      // credentials, skills, languages) + the file — one parse, reused
      // everywhere (profile, applications, future use).
      await saveParsedResumeAction(parsed);
      // Prefill the assessment answers directly (router.refresh wouldn't update
      // this component's useState), then drop them into the questions.
      const pms = Array.from(
        new Set(
          parsed.work_history
            .flatMap((w) => w.pms_systems_used.value ?? [])
            .map((s) => s.trim())
            .filter(Boolean)
        )
      );
      const yrs = yearsBucketFromNumber(
        parsed.basics.years_experience_dental.value
      );
      setAnswers((a) => ({
        ...a,
        desired_roles: parsed.desired_roles.length
          ? parsed.desired_roles
          : (a.desired_roles ?? []),
        desired_specialty: parsed.desired_specialty.length
          ? parsed.desired_specialty
          : (a.desired_specialty ?? []),
        pms_systems: pms.length ? pms : (a.pms_systems ?? []),
        years_experience: yrs ?? a.years_experience,
      }));
      setStarted(true);
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setAutofillNote("Something went wrong reading that résumé.");
    } finally {
      setParsing(false);
    }
  };

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

  // #102 (Day 28) — scroll to the top of every section reliably. Doing this in
  // an effect (after the new step renders) instead of inline in next()/back()
  // is the fix: an inline scroll could be canceled by the re-render's DOM
  // mutation, which is why it only worked "sometimes."
  useEffect(() => {
    if (started && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [stepIdx, started]);

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
    // Scroll handled by the [stepIdx] effect (reliable post-render).
  };
  const back = () => {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
    // Scroll handled by the [stepIdx] effect.
  };

  // #94 (Day 28) — landing/intro screen so candidates know what PracticeFit is
  // before answering. First-timers only; "Start now" reveals the questions,
  // "Skip for now" leaves. Re-takers skip straight to the questions.
  if (!started) {
    return (
      <div className="max-w-[680px]">
        <div className="mb-3 flex items-center gap-2">
          <PracticeFitWordmark surface="light" tm className="text-3xl" />
          <span className="text-[12px] font-bold uppercase tracking-[2px] text-slate-meta">
            assessment
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.5px] leading-tight text-ink">
          Find the practices that actually fit you.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-body">
          PracticeFit is our matching engine. Answer a few quick questions about
          your work style, clinical focus, and what matters most — and we&apos;ll
          score how well every role and practice fits <em>you</em>, then surface
          your best matches. About <strong>5 minutes</strong>. Nothing is
          required and you can stop anytime.
        </p>
        <ul className="mt-5 space-y-2.5">
          {[
            "See your best-fit roles ranked — not just a keyword search.",
            "Get found by practices whose culture + priorities match yours.",
            "We pre-fill what we can from your profile, so it's fast.",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-[14px] text-ink">
              <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-heritage-deep" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {/* #41 — résumé autofill: parse once → prefills this assessment AND the
            full profile (+ saves the file for reuse). Optional; Start still works. */}
        <div className="mt-6 rounded-lg border border-heritage/40 bg-heritage/[0.06] p-4">
          <p className="text-[13px] font-bold text-ink">
            Fastest start: autofill from your résumé
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-meta">
            Upload it once — we&apos;ll prefill this assessment <em>and</em> your
            profile, so applying later is faster. You review everything as you go.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setResumeFile(e.target.files?.[0] ?? null);
                setAutofillNote(null);
              }}
              className="block text-[13px] text-ink file:mr-3 file:cursor-pointer file:border-0 file:bg-ink file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[1.5px] file:text-ivory hover:file:bg-ink-soft"
            />
            <button
              type="button"
              onClick={autofillFromResume}
              disabled={!resumeFile || parsing}
              className="inline-flex items-center justify-center gap-2 border border-heritage-deep px-4 py-2 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep transition-colors hover:bg-heritage/10 disabled:opacity-40"
            >
              {parsing ? "Reading…" : "Autofill from résumé"}
            </button>
          </div>
          {autofillNote && (
            <p className="mt-2 text-[12px] font-semibold leading-relaxed text-heritage-deep">
              {autofillNote}
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setStarted(true);
              if (typeof window !== "undefined")
                window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 bg-ink px-7 py-3.5 text-[13px] font-bold uppercase tracking-[1.5px] text-ivory transition-colors hover:bg-ink-soft"
          >
            Start now
            <ArrowRight className="h-4 w-4" />
          </button>
          {!skipNudge ? (
            <button
              type="button"
              onClick={() => setSkipNudge(true)}
              className="text-[12px] font-semibold text-slate-meta underline underline-offset-2 hover:text-ink"
            >
              Skip for now — I&apos;ll take this later
            </button>
          ) : (
            <div className="rounded-xl border border-heritage/30 bg-cream/50 p-5">
              <p className="text-[14px] font-bold text-ink">
                You can skip — but it&apos;s only about 5 minutes, and it&apos;s
                what sharpens your matches.
              </p>
              <p className="mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-slate-body">
                Without it we match you on your profile alone — pace, autonomy,
                the procedures you love and the team you thrive on stay
                invisible. It&apos;s mostly taps, and you can stop anytime.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSkipNudge(false);
                    setStarted(true);
                    if (typeof window !== "undefined")
                      window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-heritage-deep px-5 py-2.5 text-[14px] font-bold text-ivory transition-colors hover:bg-heritage"
                >
                  Take 5 minutes
                  <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  href="/candidate/dashboard"
                  className="text-[13px] text-slate-meta underline underline-offset-2 hover:text-ink"
                >
                  Skip anyway
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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

      {/* #94/#40 (Day 28) — new candidates are routed here right after signup
          so they see the assessment, but it's never a wall: a quiet exit lets
          them leave. The dashboard onboarding step keeps nudging them back. */}
      {!isLast && (
        <div className="mt-4 text-center">
          <Link
            href="/candidate/dashboard"
            className="text-[12px] font-semibold text-slate-meta underline underline-offset-2 hover:text-ink"
          >
            Skip for now — I&apos;ll take this later
          </Link>
        </div>
      )}
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
          <div className="space-y-2">
            {/* Mobile sweep 2026-06-18 — on phones the two fixed-width (w-28)
                end-cap labels crushed the track. On mobile, both labels sit on
                ONE row above a full-width track; flanked low | slider | high
                from sm up. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px] text-slate-meta sm:hidden">
                <span>{q.sliderLabels?.low}</span>
                <span className="text-right">{q.sliderLabels?.high}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden w-28 text-right text-[12px] text-slate-meta sm:inline">
                  {q.sliderLabels?.low}
                </span>
                <div className="w-full sm:flex-1">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={typeof value === "number" ? value : 3}
                    onChange={(e) => onChange(q.key, Number(e.target.value))}
                    className="pf-slider w-full"
                  />
                  {/* #101 (Day 28) — labeled ticks so the midpoints aren't vague. */}
                  <div className="mt-1 flex justify-between px-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((t) => (
                      <span
                        key={t}
                        className={
                          "text-[11px] tabular-nums " +
                          (value === t ? "font-bold text-ink" : "text-slate-meta")
                        }
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="hidden w-28 text-[12px] text-slate-meta sm:inline">
                  {q.sliderLabels?.high}
                </span>
              </div>
            </div>
            <p className="text-center text-[12px] font-semibold text-slate-body">
              {typeof value === "number"
                ? `Your answer: ${value} of 5`
                : "Drag to choose — 1 to 5"}
            </p>
          </div>
        )}

        {q.type === "salary" && (
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink">$</span>
            <input
              type="text"
              inputMode="numeric"
              // #(Day 28) — currency with thousands separators. Display the
              // number formatted (125,000); store the raw integer.
              value={
                typeof value === "number" ? value.toLocaleString("en-US") : ""
              }
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                onChange(q.key, digits ? Number(digits) : null);
              }}
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
