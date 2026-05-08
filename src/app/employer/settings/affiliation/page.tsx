/**
 * /employer/settings/affiliation — DSO-wide affiliation reveal policy
 * (Phase 4.5.b launch-blocker, locked 2026-05-08).
 *
 * Pairs with the per-location toggle on /employer/locations/[id] —
 * together they answer "what does a candidate see when they interact
 * with one of our acquired-brand practices?"
 *
 * Three policies (locked Q2):
 *   - never           — candidates never see the corporate name, ever.
 *                       Their W-2 might say {DSO} but DSO Hire shows
 *                       only the practice name.
 *   - after_hire      — once status='hired', the corporate name appears
 *                       in the candidate's inbox + dashboard.
 *   - per_application — the recruiter manually flips a "Reveal DSO"
 *                       button on the candidate's application detail
 *                       to expose the corporate name to that one
 *                       candidate.
 *
 * Owner/admin only. HMs + recruiters land on a redirect (the surface is
 * irrelevant to them and the action would deny anyway).
 */

import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AffiliationPolicyForm } from "./affiliation-policy-form";
import type { AffiliationRevealPolicy } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Affiliation · Settings" };

export const dynamic = "force-dynamic";

export default async function AffiliationSettingsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Recruiters + hiring managers don't manage affiliation policy.
  // Redirect them to the dashboard rather than rendering a read-only
  // page they can't act on.
  if (dsoUser.role === "hiring_manager" || dsoUser.role === "recruiter") {
    redirect("/employer/dashboard");
  }

  const { data: dso } = await supabase
    .from("dsos")
    .select("name, affiliation_reveal_policy")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  const dsoName = (dso?.name as string | undefined) ?? "your DSO";
  const currentPolicy = (dso?.affiliation_reveal_policy as
    | AffiliationRevealPolicy
    | undefined) ?? "never";

  // Per-location stats — useful context: "you have 3 private-affiliation
  // locations" tells the admin whether this policy will affect anyone.
  const { count: privateCount } = await supabase
    .from("dso_locations")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", dsoUser.dso_id)
    .eq("public_dso_affiliation", false);

  const { count: totalCount } = await supabase
    .from("dso_locations")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", dsoUser.dso_id);

  return (
    <section className="max-w-[820px]">
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Affiliation
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.15] text-ink">
          When candidates learn the {dsoName} name
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Some practices in your portfolio may keep their original
          public brand even though {dsoName} owns the practice. Use the{" "}
          <strong className="text-ink font-semibold">
            Display {dsoName} on the public job page
          </strong>{" "}
          toggle on each location to control public surfaces. This
          setting controls when (if ever) a candidate at one of those
          private-affiliation practices ever learns that{" "}
          {dsoName} is behind it.
        </p>
      </header>

      {/* Stats banner — context for the admin so they know whether
          this setting matters at all yet. */}
      <div className="mb-8 border-l-2 border-heritage bg-cream/60 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-heritage-deep mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
              Current state
            </div>
            <p className="text-[13px] text-slate-body leading-relaxed">
              {(privateCount ?? 0) === 0 ? (
                <>
                  All {totalCount ?? 0} of your locations show{" "}
                  <strong className="text-ink">{dsoName}</strong>{" "}
                  publicly. This policy only kicks in for locations
                  where you turn that off — visit{" "}
                  <a
                    href="/employer/locations"
                    className="text-heritage-deep underline underline-offset-2 font-semibold"
                  >
                    Locations
                  </a>{" "}
                  to manage per-practice visibility.
                </>
              ) : (
                <>
                  <strong className="text-ink">
                    {privateCount} of {totalCount}
                  </strong>{" "}
                  locations are set to hide{" "}
                  <strong className="text-ink">{dsoName}</strong> on
                  public surfaces. Candidates applying to those
                  practices will follow the policy below.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <AffiliationPolicyForm
        currentPolicy={currentPolicy}
        dsoName={dsoName}
      />
    </section>
  );
}
