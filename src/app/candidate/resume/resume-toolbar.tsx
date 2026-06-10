"use client";

/**
 * #87a — print toolbar for the résumé page. Hidden in the printed output
 * (.no-print). "Download PDF" uses the browser's native print-to-PDF, which
 * keeps the output real text (ATS-safe) with zero server-side PDF dependency.
 * The true server-rendered-and-saved PDF file is the next increment (87b).
 */

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function ResumeToolbar() {
  return (
    <div className="no-print mx-auto mb-6 flex max-w-[760px] items-center justify-between gap-4 px-4">
      <Link
        href="/candidate/profile"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to profile
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md bg-heritage-deep px-4 py-2 text-[13px] font-bold text-ivory hover:bg-ink transition-colors"
      >
        <Printer className="h-4 w-4" />
        Download PDF
      </button>
    </div>
  );
}
