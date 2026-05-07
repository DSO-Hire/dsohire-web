/**
 * /candidate/settings/job-preferences — Phase 4.3.c.
 *
 * Replaces the redirect-to-/candidate/profile stub with a real settings tab.
 * Five sections:
 *   1. Roles + specialty (multi-select chips, canonical lists)
 *   2. License states + DSO size (50-state chips + 4-option radio)
 *   3. Locations (city/state chip array — free text)
 *   4. Schedule + temp/perm + availability
 *   5. Compensation (min + unit)
 *
 * Each section saves on its own — no whole-form submit. Mirrors the
 * privacy-tab pattern. Settings = matching prefs; Profile = what employers
 * see. Both write to the same candidates row so they can never drift.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulePreferences } from "@/lib/candidate/canonical-lists";
import { JobPreferencesForm } from "./job-preferences-form";

export const metadata: Metadata = { title: "Job preferences · Settings" };

export default async function CandidateJobPreferencesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/job-preferences");

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select(
      "desired_roles, desired_specialty, license_states, dso_size_preference, desired_locations, schedule_preferences, temp_or_perm, availability, min_salary, salary_unit"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;

  const initial = {
    desired_roles: ((c.desired_roles as string[] | null) ?? []) as string[],
    desired_specialty: ((c.desired_specialty as string[] | null) ?? []) as string[],
    license_states: ((c.license_states as string[] | null) ?? []) as string[],
    dso_size_preference:
      (c.dso_size_preference as "small" | "mid" | "large" | "any" | null) ??
      null,
    desired_locations: ((c.desired_locations as string[] | null) ?? []) as string[],
    schedule_preferences:
      (c.schedule_preferences as SchedulePreferences | null) ?? {},
    temp_or_perm:
      (c.temp_or_perm as "temp" | "perm" | "either" | null) ?? null,
    availability: (c.availability as string | null) ?? null,
    min_salary: (c.min_salary as number | null) ?? null,
    salary_unit:
      (c.salary_unit as "hourly" | "yearly" | "per_visit" | "per_day" | null) ??
      null,
  };

  return (
    <div>
      <header className="mb-6">
        <h2 className="font-display text-xl font-bold text-[#14233F]">
          What you&apos;re looking for
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Five independent surfaces. Each one writes to its own preference —
          you don&apos;t lose changes elsewhere if you save one section. These
          drive matching + Talent Pool browse; what employers see on your
          profile is set on{" "}
          <a
            href="/candidate/profile"
            className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            your profile
          </a>
          .
        </p>
      </header>
      <JobPreferencesForm initial={initial} />
    </div>
  );
}
