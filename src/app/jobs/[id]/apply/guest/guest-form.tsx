"use client";

/**
 * Guest apply form (E2.1 / Phase 5F, shipped 2026-05-11).
 *
 * Single-page form: email + name + phone + resume + cover letter +
 * screening Qs. Submits via submitGuestApplication server action.
 * Success state replaces the form with a "check your inbox to claim
 * your account" panel.
 */

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import {
  submitGuestApplication,
  type GuestApplyState,
} from "./actions";
import type {
  ScreeningQuestion,
  ScreeningQuestionOption,
  JobVerificationRequirement,
} from "../types";
import { getVerificationType } from "@/lib/verifications/types";

const initial: GuestApplyState = { ok: false };

interface GuestApplyFormProps {
  jobId: string;
  questions: ScreeningQuestion[];
  /**
   * 5G.e Tier 2 — verification requirements this job carries. Guests have
   * no profile credentials, so for v1 we render these as a stated FYI list
   * only; credential-linking + persistence happen after account creation.
   */
  verificationRequirements: JobVerificationRequirement[];
  /** Phase 5C — attribution channel from ?source= on the guest apply URL. */
  sourceTag?: string | null;
}

export function GuestApplyForm({
  jobId,
  questions,
  verificationRequirements,
  sourceTag,
}: GuestApplyFormProps) {
  const [state, submit, submitting] = useActionState(
    submitGuestApplication,
    initial
  );

  if (state.ok && state.email) {
    return (
      <section className="border-l-4 border-heritage bg-cream p-8 max-w-[640px]">
        <CheckCircle2
          className="h-8 w-8 text-heritage-deep mb-4"
          aria-hidden
        />
        <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
          Application submitted
        </h2>
        <p className="text-[14px] text-ink leading-relaxed mb-4">
          We&apos;ve sent a confirmation to{" "}
          <strong>{state.email}</strong>. Check your inbox for a magic link
          that lets you claim your account &mdash; you&apos;ll be able to
          track this application and apply to other roles in one click.
        </p>
        <p className="text-[13px] text-slate-body leading-relaxed">
          <Mail className="inline h-4 w-4 mr-1 -mt-0.5 text-heritage-deep" />
          The link is valid for 90 days. No password required &mdash; click
          the link and you&apos;re in.
        </p>
      </section>
    );
  }

  return (
    <form action={submit} className="space-y-8" encType="multipart/form-data">
      <input type="hidden" name="job_id" value={jobId} />
      {sourceTag && <input type="hidden" name="source" value={sourceTag} />}
      <div className="hidden" aria-hidden>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Identity */}
      <fieldset className="space-y-5">
        <legend className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
          About you
        </legend>

        <div>
          <label
            htmlFor="guest-full-name"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Full name <span className="text-heritage">*</span>
          </label>
          <input
            id="guest-full-name"
            type="text"
            name="full_name"
            required
            autoComplete="name"
            placeholder="Jordan Bailey"
            className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="guest-email"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Email <span className="text-heritage">*</span>
          </label>
          <input
            id="guest-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
          <p className="mt-1.5 text-[12px] text-slate-meta">
            Used to send your confirmation + the link to claim your account.
          </p>
        </div>

        <div>
          <label
            htmlFor="guest-phone"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Phone <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">(optional)</span>
          </label>
          <input
            id="guest-phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
        </div>
      </fieldset>

      {/* Resume */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Resume
        </legend>
        <label
          htmlFor="guest-resume"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Resume <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">(PDF or Word, up to 10&nbsp;MB)</span>
        </label>
        <input
          id="guest-resume"
          type="file"
          name="resume"
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="block w-full text-[14px] text-ink file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-[12px] file:font-bold file:tracking-[1.5px] file:uppercase file:text-ivory hover:file:bg-ink-soft"
        />
      </fieldset>

      {/* Cover letter */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Cover letter <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">(optional)</span>
        </legend>
        <textarea
          name="cover_letter"
          rows={5}
          placeholder="A short note to the hiring team — what brings you to this role, what excites you about the practice."
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed resize-y"
        />
      </fieldset>

      {/* Screening questions */}
      {questions.length > 0 && (
        <fieldset className="space-y-5 pt-2 border-t border-[var(--rule)]">
          <legend className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mt-4 mb-3">
            Screening questions
          </legend>
          {questions.map((q) => (
            <ScreeningField key={q.id} question={q} />
          ))}
        </fieldset>
      )}

      {/* Verification requirements — FYI only for guests (5G.e Tier 2).
          Guests have no profile credentials, so v1 just states what the
          role expects; the candidate confirms these after creating an
          account. No fields submitted, nothing persisted here. */}
      {verificationRequirements.length > 0 && (
        <fieldset className="space-y-3 pt-2 border-t border-[var(--rule)]">
          <legend className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mt-4 mb-3">
            What this role requires
          </legend>
          <p className="text-[13px] text-slate-body leading-relaxed">
            The hiring team asks applicants to confirm the items below.
            You&apos;ll confirm these &mdash; and can link supporting
            credentials &mdash; after you create an account from the link
            we email you.
          </p>
          <ul className="space-y-2">
            {verificationRequirements.map((req) => {
              const vt = getVerificationType(req.verification_type);
              return (
                <li
                  key={req.verification_type}
                  className="flex items-start gap-2.5 text-[14px] text-ink"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-heritage"
                    aria-hidden
                  />
                  <span>
                    <span className="font-semibold">
                      {vt?.label ?? req.verification_type}
                    </span>
                    {req.required && (
                      <span className="text-heritage ml-1">*</span>
                    )}
                    {vt?.candidateHint && (
                      <span className="block text-[13px] text-slate-body leading-relaxed">
                        {vt.candidateHint}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}

      <div className="pt-4 border-t border-[var(--rule)]">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting…" : "Submit application"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </button>
        <p className="mt-3 text-[12px] text-slate-meta leading-relaxed max-w-[480px]">
          By submitting, you agree to our{" "}
          <Link href="/legal/candidate-terms/" className="underline">
            Candidate Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy/" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

function ScreeningField({ question }: { question: ScreeningQuestion }) {
  const name = `q__${question.id}`;
  const labelId = `${name}-label`;
  const options: ScreeningQuestionOption[] = question.options ?? [];

  return (
    <div>
      <label
        id={labelId}
        htmlFor={name}
        className="block text-[13px] font-bold text-ink mb-1.5"
      >
        {question.prompt}
        {question.required && <span className="text-heritage ml-1">*</span>}
      </label>
      {question.helper_text && (
        <p className="text-[12px] text-slate-meta mb-2 leading-relaxed">
          {question.helper_text}
        </p>
      )}

      {question.kind === "short_text" && (
        <input
          id={name}
          type="text"
          name={name}
          required={question.required}
          className="w-full px-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      )}
      {question.kind === "long_text" && (
        <textarea
          id={name}
          name={name}
          rows={3}
          required={question.required}
          className="w-full px-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed resize-y"
        />
      )}
      {question.kind === "yes_no" && (
        <div className="flex gap-3" role="radiogroup" aria-labelledby={labelId}>
          {["yes", "no"].map((v) => (
            <label
              key={v}
              className="inline-flex items-center gap-2 cursor-pointer text-[14px] text-ink"
            >
              <input
                type="radio"
                name={name}
                value={v}
                required={question.required}
                className="h-4 w-4"
              />
              {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      )}
      {question.kind === "single_select" && (
        <select
          id={name}
          name={name}
          required={question.required}
          defaultValue=""
          className="w-full px-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        >
          <option value="" disabled>
            Select one…
          </option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {question.kind === "multi_select" && (
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 cursor-pointer text-[14px] text-ink"
            >
              <input type="checkbox" name={name} value={opt.id} className="h-4 w-4" />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {question.kind === "number" && (
        <input
          id={name}
          type="number"
          name={name}
          required={question.required}
          step="1"
          className="w-44 px-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      )}
    </div>
  );
}
