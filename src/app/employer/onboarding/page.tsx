/**
 * /employer/onboarding — first-time setup wizard.
 *
 * After magic-link verification, the user lands here. Currently shows the
 * welcome state + a single-step "add your first location" form.
 *
 * Phase 2 Week 2 expands this into a 3-step wizard:
 *   Step 1: Confirm DSO details (auto-filled from sign-up)
 *   Step 2: Add locations (this form)
 *   Step 3: Invite teammates (optional, skip-able)
 * Then redirect to /employer/dashboard.
 */

import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmployerShell } from "@/components/employer/employer-shell";
import { OnboardingForm } from "./onboarding-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set Up Your DSO",
};

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, full_name, dso:dsos(id, name, slug, status)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // If they have no DSO at all, something went wrong during sign-up.
  // Send back to the marketing site to start over.
  if (!dsoUser) {
    redirect("/employer/sign-up");
  }

  const dso = dsoUser.dso as unknown as {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;

  // Count locations to decide whether onboarding is "done"
  const { count: locationsCount } = await supabase
    .from("dso_locations")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoUser.dso_id);

  // If they already have at least one location, they've finished onboarding.
  // Send to dashboard.
  if ((locationsCount ?? 0) > 0) {
    redirect("/employer/dashboard");
  }

  return (
    <EmployerShell active="dashboard">
      <header className="mb-10 max-w-[760px]">
        <div className="flex items-center gap-3 text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">
          <CheckCircle2 className="h-4 w-4 text-heritage" />
          Email verified — welcome to DSO Hire
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Add your first practice location.
        </h1>
        <p className="mt-4 text-base text-slate-body leading-[1.7] max-w-[640px]">
          DSO Hire posts jobs across your locations in a single flow. We need at
          least one location to enable job posting. You can add more anytime
          from the Locations tab.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)] max-w-[1100px]">
        {/* Form */}
        <div className="bg-white p-8 sm:p-10">
          <OnboardingForm dsoId={dsoUser.dso_id} />
        </div>

        {/* Side: DSO summary */}
        <aside className="bg-cream p-8 sm:p-10">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Your DSO
          </div>
          <div className="text-[20px] font-extrabold tracking-[-0.4px] text-ink mb-1">
            {dso?.name}
          </div>
          <div className="text-[12px] font-mono text-slate-meta tracking-[0.3px] mb-6">
            dsohire.com/companies/{dso?.slug}
          </div>

          <div className="text-[11px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Status
          </div>
          <div className="text-[13px] text-ink mb-6">
            {dso?.status === "pending"
              ? "Pending — Cameron is verifying your DSO. You can keep setting up while we review."
              : dso?.status}
          </div>

          <div className="pt-6 border-t border-[var(--rule)] text-[12px] text-slate-meta leading-relaxed">
            Need help? Email{" "}
            <a
              href="mailto:cam@dsohire.com"
              className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
            >
              cam@dsohire.com
            </a>{" "}
            and Cameron will reply within one business day.
          </div>
        </aside>
      </div>
    </EmployerShell>
  );
}
