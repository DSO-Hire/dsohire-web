/**
 * /candidate/settings/privacy — Phase 4.3.d Privacy & Visibility tab.
 *
 * Server component: pulls the candidate's current visibility settings,
 * blocked DSOs (joined to dsos for display name + slug), and
 * work_history is_current/auto_blocklisted state for the master toggle.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivacyForm } from "./privacy-form";
import type { BlockedEmployer } from "./actions";

export const metadata: Metadata = { title: "Privacy & visibility · Settings" };

export default async function CandidatePrivacyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/privacy");

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select(
      "id, cv_visibility, resume_visibility, contact_info_visibility, practice_fit_consent"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidateRow) redirect("/candidate/dashboard");

  const candidateId = candidateRow.id as string;

  // Pull blocked employers + work history in parallel.
  const [{ data: blockedRows }, { data: currentWork }] = await Promise.all([
    supabase
      .from("candidate_blocked_employers")
      .select(
        "id, dso_id, reason_optional, created_at, dsos:dsos(name, slug)"
      )
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_work_history")
      .select("is_current, auto_blocklisted")
      .eq("candidate_id", candidateId)
      .eq("is_current", true),
  ]);

  // Shape blocked rows into the BlockedEmployer type the form expects.
  const blocked: BlockedEmployer[] = (blockedRows ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      dso_id: string;
      reason_optional: string | null;
      created_at: string;
      dsos: { name: string; slug: string | null } | null;
    };
    return {
      id: r.id,
      dso_id: r.dso_id,
      dso_name: r.dsos?.name ?? "(unknown DSO)",
      dso_slug: r.dsos?.slug ?? null,
      reason_optional: r.reason_optional,
      created_at: r.created_at,
    };
  });

  const hasCurrent = (currentWork ?? []).length > 0;
  // Show the "hide from current employer" toggle as ON if every current
  // work history row is auto-blocklisted (the toggle bulk-flips them).
  const hideFromCurrent =
    hasCurrent &&
    (currentWork ?? []).every((row) => Boolean(row.auto_blocklisted));

  const c = candidateRow as Record<string, unknown>;
  const initial = {
    cv_visibility:
      (c.cv_visibility as
        | "hidden"
        | "recruiters_only"
        | "open_to_work") ?? "recruiters_only",
    resume_visibility:
      (c.resume_visibility as
        | "public"
        | "verified_dso_only"
        | "after_apply"
        | "hidden") ?? "after_apply",
    contact_info_visibility:
      (c.contact_info_visibility as "always" | "after_apply") ?? "after_apply",
    practice_fit_consent:
      (c.practice_fit_consent as "off" | "results_only" | "full") ?? "off",
    has_current_employer: hasCurrent,
    hide_from_current_employer: hideFromCurrent,
  };

  return (
    <div>
      <header className="mb-6">
        <h2 className="font-display text-xl font-bold text-[#14233F]">
          Your privacy is the default
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Five independent surfaces. Each one writes to its own setting —
          you don&apos;t lose changes elsewhere if you save one section.
        </p>
      </header>
      <PrivacyForm initial={initial} blocked={blocked} />
    </div>
  );
}
