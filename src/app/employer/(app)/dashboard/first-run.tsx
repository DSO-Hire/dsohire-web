/**
 * FirstRunDashboard — the day-one dashboard (design program 3b).
 *
 * Before any job exists, the full cockpit is a wall of all-zero tiles —
 * technically true, emotionally deflating. This calm composition takes
 * its place: one hero CTA (post the first job), the SAME persisted
 * OnboardingChecklist the cockpit uses, and an honest one-liner about
 * what this page becomes. The moment jobsCount > 0 the page renders the
 * full cockpit again — nothing to migrate, nothing stored.
 *
 * Server component — composition only, no new queries (the counts
 * arrive from the loaders the page already awaited).
 */

import Link from "next/link";
import { ArrowRight, MapPin, Plus } from "lucide-react";
import {
  OnboardingChecklist,
  type OnboardingItem,
} from "@/components/onboarding/onboarding-checklist";
import { Button } from "@/components/ui/button";

export function FirstRunDashboard({
  firstName,
  hasLocation,
  items,
}: {
  firstName: string;
  /** True once at least one practice location exists. */
  hasLocation: boolean;
  /** The same server-computed checklist items the cockpit shows. */
  items: OnboardingItem[];
}) {
  return (
    <div className="mx-auto max-w-[760px]">
      {/* Hero — one job to do. Heritage is earned here: this CTA is the
          moment the account starts being worth paying for. */}
      <section className="border border-[var(--rule)] bg-card p-8 sm:p-12 text-center">
        <div className="mb-3 text-2xs font-bold uppercase tracking-[2.5px] text-heritage-deep">
          Welcome to DSO Hire
        </div>
        <h2 className="mx-auto mb-3 max-w-[520px] text-2xl font-extrabold leading-[1.15] tracking-[-0.6px] text-ink sm:text-3xl">
          Let&apos;s get your first role live, {firstName}.
        </h2>
        <p className="mx-auto mb-8 max-w-[460px] text-sm leading-relaxed text-slate-body">
          {hasLocation
            ? "Your practice is set up — post a role and applications land right here."
            : "Two steps: add a practice location, then post your first role. Applications land right here."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {hasLocation ? (
            <Button asChild variant="heritage" size="lg">
              <Link href="/employer/jobs/new">
                <Plus className="size-4" strokeWidth={2.5} />
                Post your first job
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="heritage" size="lg">
                <Link href="/employer/locations">
                  <MapPin className="size-4" />
                  Add your first location
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/employer/jobs/new">
                  Post a job
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {/* The same persisted checklist the cockpit shows — one source of
          truth for setup progress, two framings. */}
      <div className="mt-6">
        <OnboardingChecklist
          title="Get started"
          subtitle="Knock these out to get your hiring running — you can do them in any order."
          storageKey="employer-onboarding-checklist-v1"
          items={items}
        />
      </div>

      {/* Honest preview of what graduates in — no fake numbers, just the
          promise. */}
      <p className="mt-6 text-center text-xs leading-relaxed text-slate-meta">
        Once your first job is live, this page becomes your hiring cockpit —
        live pipeline, response-time goals, and the next best action for
        every candidate.
      </p>
    </div>
  );
}
