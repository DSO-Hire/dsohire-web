/**
 * /candidate/resume — #87a one-click résumé render.
 *
 * Renders the candidate's canonical profile into a clean, ATS-safe résumé
 * (the "Classic" template) on a print-optimized page. "Download PDF" prints
 * to the browser's PDF engine — real text, no server PDF dependency. This is
 * the render core the editable wizard (87b) and template gallery (87c) build
 * on. Deliberately NOT wrapped in CandidateShell so the printed sheet is just
 * the résumé.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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

  return (
    <div className="resume-screen-bg min-h-screen bg-slate-100 py-8">
      <style>{PRINT_CSS}</style>

      <ResumeToolbar />

      {sparse && (
        <div className="no-print mx-auto mb-4 max-w-[760px] rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          Your résumé is looking light. Add your work history, education, and
          skills on your profile and they&apos;ll appear here automatically.{" "}
          <Link href="/candidate/profile" className="font-bold underline">
            Edit profile →
          </Link>
        </div>
      )}

      <TemplatePicker current={templateId} />

      <div className="resume-sheet mx-auto max-w-[760px] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
        <ResumeDocument data={data} template={templateId} />
      </div>
    </div>
  );
}
