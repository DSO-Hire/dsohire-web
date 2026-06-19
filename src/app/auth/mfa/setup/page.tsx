/**
 * /auth/mfa/setup — forced 2FA enrollment (Phase 4.5.d).
 *
 * Reached when a DSO has `require_mfa = true` and the team member doesn't
 * have a verified factor yet. EmployerShell's guard pushes them here.
 *
 * Server-side guard:
 *   - Not signed in → /employer/sign-in
 *   - Already has a verified factor → /employer/dashboard (or /challenge if
 *     the session is still aal1)
 *   - DSO does NOT require MFA → /employer/dashboard (the user can enroll
 *     voluntarily from Settings → Account; this forced page is only for
 *     mandated cases)
 *
 * The page renders a slim, no-cancel version of the same setup wizard
 * the Account page uses. After completion, the user is sent to dashboard.
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

  // Confirm the DSO actually requires MFA — if not, kick to dashboard.
  // (Voluntary enrollment lives on /employer/settings/account.)
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: dso } = await supabase
    .from("dsos")
    .select("name, require_mfa")
    .eq("id", dsoUser.dso_id as string)
    .maybeSingle();
  const requireMfa = (dso?.require_mfa as boolean | null) === true;
  if (!requireMfa) {
    redirect("/employer/dashboard");
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-cream/30 px-6 py-12">
      <div className="w-full max-w-[640px] rounded border border-[var(--rule)] bg-card p-8 sm:p-10 my-8">
        <div className="mb-6 inline-flex items-center gap-2.5 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          <ShieldCheck className="size-3.5" />
          Two-factor required
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2 leading-tight">
          {(dso?.name as string | undefined) ?? "Your DSO"} requires 2FA.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed mb-8">
          Set up an authenticator app to continue. You&apos;ll also get 10
          one-time recovery codes in case you lose access to your device.
          This is a one-time setup — future sign-ins just need your code.
        </p>
        <ForcedSetupWizard />
      </div>
    </main>
  );
}
