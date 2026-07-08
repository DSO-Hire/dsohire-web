"use client";

/**
 * CorporateJobIntro — the Step-1 launchpad chrome for
 * /employer/jobs/new/corporate: hero + practice cross-link banner.
 * Subscribes to the wizard-step signal and collapses once the user advances
 * past Step 1 (mirrors JobIntro on the practice flow).
 */

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { useWizardStep } from "@/lib/ui/wizard-step";

export function CorporateJobIntro() {
  const step = useWizardStep();
  if (step > 0) return null; // collapse after Step 1

  return (
    <>
      <header className="mb-8">
        <div className="text-2xs font-bold tracking-[3px] uppercase text-corporate mb-2">
          New Corporate Job Posting
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Post a corporate role.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          DSO-wide leadership and corporate-function roles — finance, ops,
          marketing, HR, and more. These post to the Corporate Roles tab on
          the public job board.
        </p>
      </header>

      {/* Cross-link banner — back to the practice/clinical wizard. The
          reverse banner lives on /employer/jobs/new. */}
      <div className="mb-8 max-w-[820px] border-l-4 border-heritage-deep bg-heritage text-primary-foreground p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-primary-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-primary-foreground mb-0.5">
              Hiring for a practice role instead?
            </p>
            <p className="text-xs text-primary-foreground/80 leading-relaxed">
              Dentists, hygienists, assistants, and front-office roles use
              the practice job wizard.
            </p>
          </div>
        </div>
        <Link
          href="/employer/jobs/new"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-2xs font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
        >
          Practice job wizard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
}
