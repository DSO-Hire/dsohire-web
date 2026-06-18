/**
 * /candidate/resume — #87a one-click résumé render.
 *
 * Renders the candidate's canonical profile into a clean, ATS-safe résumé
 * (the "Classic" template) on a print-optimized page. "Download PDF" prints
 * to the browser's PDF engine — real text, no server PDF dependency. This is
 * the render core the editable wizard (87b) and template gallery (87c) build
 * on. The persistent candidate nav comes from the (app) group layout; the shell
 * chrome is hidden in print (print:hidden) plus PRINT_CSS below, so Cmd/Ctrl+P
 * still yields just the résumé sheet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileUp, Sparkles } from "lucide-react";
import {
  getResumeData,
  getResumeTemplateId,
  resumeHasContent,
} from "@/lib/resume/resume-data";
import { ResumeDocument } from "@/components/resume/resume-document";
import { ResumeToolbar } from "./resume-toolbar";
import { TemplatePicker } from "./template-picker";

export const metadata: Metadata = { title: "Your résumé" };

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  .resume-screen-bg { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
  .resume-sheet { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
}
@page { margin: 0.6in; }
`;

export default async function CandidateResumePage() {
  const [data, templateId] = await Promise.all([
    getResumeData(),
    getResumeTemplateId(),
  ]);
  if (!data) redirect("/candidate/profile");
  const sparse = !resumeHasContent(data);

  // No résumé on file yet → a friendly two-path landing. The nav comes from the
  // (app) layout; the print-clean view below is only for an actual rendered
  // résumé. Build-for-free is the emphasized path.
  if (sparse) {
    return (
      <div className="mx-auto max-w-[680px] py-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Let’s get your résumé ready
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-body">
            You don’t have a résumé on file yet. Start whichever way is easier —
            you can switch anytime, and anything you add flows straight onto your
            profile.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {/* Primary — build for free */}
            <Link
              href="/candidate/resume/build"
              className="group block border-2 border-heritage bg-heritage/[0.06] p-5 transition-colors hover:bg-heritage/10"
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-heritage-deep">
                <Sparkles className="h-3.5 w-3.5" />
                Free
              </span>
              <h2 className="mt-2 text-[17px] font-extrabold text-ink">
                Build one for free
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-body">
                No résumé yet? We’ll guide you through a polished, ATS-ready
                résumé in a few minutes — completely free.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-heritage-deep">
                Start building
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>

            {/* Secondary — upload your own */}
            <Link
              href="/candidate/profile/import"
              className="group block border border-[var(--rule)] bg-white p-5 transition-colors hover:border-heritage-deep"
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-slate-meta">
                <FileUp className="h-3.5 w-3.5" />
                Upload
              </span>
              <h2 className="mt-2 text-[17px] font-extrabold text-ink">
                Upload your own
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-body">
                Already have one? Upload it and we’ll read it to fill in your
                profile automatically — then refine it here.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-ink">
                Upload résumé
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-slate-meta">
            Prefer to type it in?{" "}
            <Link
              href="/candidate/profile"
              className="font-bold text-heritage-deep underline"
            >
              Edit your profile
            </Link>{" "}
            and your résumé fills in automatically.
          </p>
      </div>
    );
  }

  return (
    <div className="resume-screen-bg min-h-screen bg-slate-100 py-8">
      <style>{PRINT_CSS}</style>

      <ResumeToolbar />

      <TemplatePicker current={templateId} />

      <div className="resume-sheet mx-auto max-w-[760px] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
        <ResumeDocument data={data} template={templateId} />
      </div>
    </div>
  );
}
