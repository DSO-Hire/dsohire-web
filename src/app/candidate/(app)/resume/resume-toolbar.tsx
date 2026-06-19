"use client";

/**
 * #87b — résumé page toolbar. Hidden in print (.no-print).
 *  • Download PDF  → server-generated /candidate/resume/pdf (real text, ATS-safe)
 *  • Save to my profile → saveResumePdf(): uploads the PDF + sets resume_url,
 *    so the built résumé is the file attached to applications.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, Loader2 } from "lucide-react";
import { saveResumePdf } from "@/app/candidate/resume/actions";

export function ResumeToolbar() {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveResumePdf();
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="no-print mx-auto mb-6 max-w-[760px] px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/candidate/profile"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to profile
        </Link>
        <div className="flex items-center gap-2.5">
          <a
            href="/candidate/resume/build"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--rule)] bg-card px-4 py-2 text-[13px] font-bold text-ink hover:border-heritage-deep transition-colors"
          >
            Edit step-by-step
          </a>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--rule)] bg-card px-4 py-2 text-[13px] font-bold text-ink hover:border-heritage-deep transition-colors disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4 text-heritage-deep" />
            ) : null}
            {saved ? "Saved to profile" : "Save to my profile"}
          </button>
          <a
            href="/candidate/resume/pdf"
            className="inline-flex items-center gap-2 rounded-md bg-heritage-deep px-4 py-2 text-[13px] font-bold text-primary-foreground hover:bg-ink transition-colors"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </a>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-right text-[12px] text-danger">{error}</p>
      )}
    </div>
  );
}
