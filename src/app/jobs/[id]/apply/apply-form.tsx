"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, FileUp } from "lucide-react";
import { applyToJob, type ApplyState } from "./actions";

const initial: ApplyState = { ok: false };

export function ApplyForm({
  jobId,
  jobTitle,
  hasSavedResume,
  savedResumeName,
}: {
  jobId: string;
  jobTitle: string;
  hasSavedResume: boolean;
  savedResumeName?: string | null;
}) {
  const [state, action, pending] = useActionState(applyToJob, initial);

  if (state.ok) {
    return (
      <div className="border-l-4 border-heritage bg-cream p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          {state.alreadyApplied ? "Application updated" : "Application sent"}
        </div>
        <p className="text-[15px] text-ink leading-relaxed mb-4">
          {state.message}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/candidate/dashboard"
            className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            View Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            Browse More Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6" encType="multipart/form-data">
      <input type="hidden" name="job_id" value={jobId} />

      <div>
        <label
          htmlFor="cover_letter"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Why are you a fit for this role?{" "}
          <span className="text-slate-meta normal-case font-medium tracking-normal">
            (optional, but recommended)
          </span>
        </label>
        <textarea
          id="cover_letter"
          name="cover_letter"
          rows={6}
          placeholder={`A short note to the hiring team at this DSO. Mention what excites you about this ${jobTitle.toLowerCase()} role and what experience makes you a fit.`}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
        />
        <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
          Personalized cover letters typically get 2–3× more interview
          requests than generic applications.
        </p>
      </div>

      <div>
        <label
          htmlFor="resume"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Resume {!hasSavedResume && <span className="text-heritage">*</span>}
        </label>

        {hasSavedResume && (
          <div className="mb-3 p-3 bg-cream border border-[var(--rule)] flex items-start gap-3">
            <FileUp className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink leading-snug">
                Using your saved resume
              </div>
              <div className="text-[11px] text-slate-body leading-snug mt-0.5">
                {savedResumeName ?? "Stored on your profile"}. Upload below to
                replace it for this application only.
              </div>
            </div>
          </div>
        )}

        <input
          id="resume"
          type="file"
          name="resume"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required={!hasSavedResume}
          className="block w-full text-[13px] text-ink file:mr-4 file:px-5 file:py-2.5 file:border-0 file:text-[10px] file:font-bold file:tracking-[1.5px] file:uppercase file:bg-ink file:text-ivory hover:file:bg-ink-soft file:cursor-pointer file:transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
          PDF, DOC, or DOCX. Max 10 MB.
        </p>
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[13px] text-red-900">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Submitting…" : "Submit Application"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-[12px] text-slate-meta leading-relaxed">
        Your application goes directly to the hiring team at this DSO. They
        can see your name, email, resume, and cover letter. By submitting you
        agree to our{" "}
        <a
          href="/legal/candidate-terms"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Candidate Terms
        </a>
        .
      </p>
    </form>
  );
}
