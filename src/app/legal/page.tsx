/**
 * /legal — index of all legal documents.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LEGAL_INDEX, loadLegalDoc } from "@/lib/legal/loader";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Privacy, terms, cookies, acceptable use, and DMCA policies for DSO Hire LLC.",
};

export default function LegalIndex() {
  const docs = LEGAL_INDEX.map((entry) => {
    const doc = loadLegalDoc(entry.slug);
    return { ...doc, blurb: entry.blurb };
  });

  return (
    <div className="pt-[120px] pb-24 px-6 sm:px-14 max-w-[1000px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Legal
      </div>
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5">
        DSO Hire policies and agreements.
      </h1>
      <p className="text-base text-slate-body leading-[1.7] max-w-[640px] mb-12">
        These documents govern how DSO Hire LLC operates, what we promise users,
        and what we ask in return. Templates current as of April 30, 2026 — final
        attorney review pending before launch.
      </p>

      <ul className="border-t border-[var(--rule)] list-none">
        {docs.map((doc) => (
          <li key={doc.slug} className="border-b border-[var(--rule)]">
            <Link
              href={`/legal/${doc.slug}`}
              className="group flex items-start justify-between gap-8 py-7 transition-colors hover:bg-cream px-2 -mx-2"
            >
              <div className="flex-1">
                <div className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-1.5">
                  {doc.title}
                </div>
                <div className="text-sm text-slate-body leading-relaxed max-w-[560px]">
                  {doc.blurb}
                </div>
                <div className="text-[10px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-3">
                  Effective {doc.effectiveDate}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 mt-1.5 text-slate-meta group-hover:text-heritage transition-colors flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-[13px] text-slate-meta leading-relaxed max-w-[640px]">
        Questions about any of these policies? Email{" "}
        <a
          href="mailto:cam@dsohire.com"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          cam@dsohire.com
        </a>
        . For copyright takedown notices, see the{" "}
        <Link
          href="/legal/dmca"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          DMCA procedure
        </Link>
        .
      </p>
    </div>
  );
}
