"use client";

/**
 * JobIntro — the Step-1 launchpad chrome for /employer/jobs/new: hero,
 * corporate cross-link banner, and the "Start from" clone chips. Subscribes
 * to the wizard-step signal and collapses once the user advances past
 * Step 1, so Steps 2+ get a clean form under the wizard's own sticky header.
 */

import Link from "next/link";
import { ArrowRight, Briefcase, Copy } from "lucide-react";
import { useWizardStep } from "@/lib/ui/wizard-step";
import { cloneJob } from "../actions";

export interface RecentJob {
  id: string;
  title: string;
  locationName: string | null;
  createdAt: string;
}

export function JobIntro({ recentJobs }: { recentJobs: RecentJob[] }) {
  const step = useWizardStep();
  if (step > 0) return null; // collapse after Step 1

  return (
    <>
      <header className="mb-10">
        <div className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          New Job Posting
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Post a job.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          Write the role once. Assign it to as many of your practices as you
          need. We render separate location-specific listings automatically.
        </p>
      </header>

      {/* Cross-link banner — over to the corporate job wizard. The reverse
          banner lives on /employer/jobs/new/corporate. */}
      <div className="mb-8 max-w-[820px] border-l-4 border-heritage bg-hero text-hero-foreground p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Briefcase className="h-5 w-5 text-[var(--heritage-bright,#8db8a3)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-hero-foreground mb-0.5">
              Hiring for a corporate role instead?
            </p>
            <p className="text-xs text-hero-foreground/70 leading-relaxed">
              DSO-wide leadership and corporate-function roles — finance,
              ops, marketing, HR — use the corporate job wizard.
            </p>
          </div>
        </div>
        <Link
          href="/employer/jobs/new/corporate"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-heritage text-primary-foreground text-2xs font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors"
        >
          Corporate job wizard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Lane 6 — start from a previous posting. Each chip submits the
          existing cloneJob server action: full draft copy (skills +
          screening questions included), lands on the populated editor. */}
      {recentJobs.length > 0 && (
        <div className="mb-8 max-w-[820px]">
          <p className="text-2xs font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            Start from
          </p>
          <div className="flex flex-wrap gap-2">
            {recentJobs.map((j) => (
              <form key={j.id} action={cloneJob}>
                <input type="hidden" name="job_id" value={j.id} />
                <button
                  type="submit"
                  title={`Duplicate "${j.title}" as a new draft and open it in the editor`}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-card border border-[var(--rule-strong)] text-xs font-semibold text-ink hover:border-heritage hover:bg-heritage/5 transition-colors max-w-[320px]"
                >
                  <Copy className="h-3.5 w-3.5 text-heritage-deep shrink-0" />
                  <span className="truncate">{j.title}</span>
                  <span className="text-2xs text-slate-meta whitespace-nowrap">
                    {j.locationName ? `${j.locationName} · ` : ""}
                    {new Date(j.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </button>
              </form>
            ))}
            <span className="self-center text-2xs text-slate-meta">
              — or start blank below
            </span>
          </div>
        </div>
      )}
    </>
  );
}
