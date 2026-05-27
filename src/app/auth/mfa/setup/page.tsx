/**
 * /auth/mfa/setup — forced 2FA enrollment.
 *
 * Reached when an employer-side user (any role: owner / admin / recruiter)
 * doesn't yet have a verified TOTP factor. EmployerShell's guard pushes
 * them here on every dashboard hit until enrolled.
 *
 * Day 21 (2026-05-27): widened from per-DSO opt-in (`dso.require_mfa`) to
 * platform-wide requirement for every employer role. Candidate accounts
 * are not gated — candidates can still enroll voluntarily through their
 * own settings surface. Per the Security_Breach_Diagnostic memo P0 #1.
 *
 * Server-side guard:
 *   - Not signed in → /employer/sign-in
 *   - Not a dso_user (candidate or mid-invite) → /employer/onboarding
 *     (or dashboard if already enrolled — candidates can use voluntary
 *     enrollment from their own surface).
 *   - Already enrolled + aal2 → /employer/dashboard
 *   - Already enrolled + aal1 → /auth/mfa/challenge
 *   - Otherwise → render the forced wizard
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaState } from "@/lib/auth/mfa";
import { ForcedSetupWizard } from "./forced-setup-wizard";

export const metadata: Metadata = {
  title: "Set up two-factor · DSO Hire",
};

export const dynamic = "force-dynamic";

export default async function ForcedMfaSetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const state = await getMfaState(supabase);
  if (state.isEnrolled && state.currentLevel === "aal2") {
    redirect("/employer/dashboard");
  }
  if (state.isEnrolled && state.currentLevel !== "aal2") {
    redirect("/auth/mfa/challenge?next=/employer/dashboard");
  }

  // Only employer-side users land here. Candidates without a dso_users
  // row are bounced to their own dashboard — voluntary enrollment lives
  // on the candidate settings surface.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    // No DSO membership — could be a candidate, a mid-invite admin, or
    // someone who just signed up. Send to onboarding which itself routes
    // candidates to /candidate/dashboard if appropriate.
    redirect("/employer/onboarding");
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-cream/30 px-6 py-12">
      <div className="w-full max-w-[640px] rounded border border-[var(--rule)] bg-white p-8 sm:p-10 my-8">
        <div className="mb-6 inline-flex items-center gap-2.5 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          <ShieldCheck className="size-3.5" />
          Two-factor required
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2 leading-tight">
          Set up two-factor authentication.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed mb-8">
          DSO Hire requires two-factor authentication for every employer
          account — candidate applications and contact details are sensitive,
          and a single password isn&apos;t enough to keep them safe.
          You&apos;ll also get 10 one-time recovery codes in case you lose
          access to your device. This is a one-time setup — future sign-ins
          just need your code.
        </p>
        <ForcedSetupWizard />
      </div>
    </main>
  );
}
