/**
 * /admin/account — superadmin account security: set/change the password
 * used at /admin/sign-in, plus a pointer to 2FA enrollment. Inside the
 * (app) group, so the Tier-1 admin gate in the layout applies; the
 * founder allowlist is re-checked here since password changes are
 * founder-surface sensitive.
 */

import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/admin/gate";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { getMfaState } from "@/lib/auth/mfa";
import { MfaSection } from "@/app/employer/(app)/settings/account/mfa-section";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Admin Account",
  robots: { index: false, follow: false },
};

export default async function AdminAccountPage() {
  const user = await requireSuperadmin("/admin/account");

  // Same wizard the employer settings page uses; admin accounts have no
  // DSO membership, so the org-wide toggle (isOwner) stays off.
  const supabase = await createSupabaseServerClient();
  const mfaState = await getMfaState(supabase);
  const admin = createSupabaseServiceRoleClient();
  const { count } = await admin
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", user.id)
    .is("used_at", null);

  return (
    <div className="p-8 space-y-10">
      <header>
        <div className="text-2xs font-bold tracking-[2.5px] uppercase text-slate-meta mb-1">
          Account Security
        </div>
        <h1 className="text-2xl font-bold text-ink">Admin account</h1>
        <p className="text-sm text-slate-body mt-1">
          Signed in as <span className="font-semibold">{user.email}</span>
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-ink">Change password</h2>
        <p className="text-sm text-slate-body max-w-md leading-relaxed">
          This is the password for your admin sign-in (and anywhere else this
          account signs in with a password). Use a long, unique one from a
          password manager.
        </p>
        <SetPasswordForm />
      </section>

      <section className="pt-6 border-t border-[var(--rule)] max-w-2xl">
        <MfaSection
          initialEnrolled={mfaState.isEnrolled}
          remainingRecoveryCodes={count ?? 0}
          isOwner={false}
          isEnterprise={false}
          initialRequireMfa={false}
          initialFactorId={mfaState.verifiedFactorId}
        />
      </section>
    </div>
  );
}
