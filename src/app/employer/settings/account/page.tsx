/**
 * /employer/settings/account — Account category (Phase 4.5.a).
 *
 * The default landing page for /employer/settings (the bare /settings
 * route redirects here). Currently surfaces the DSO logo upload + the
 * password form that lived on the old single-page settings surface.
 *
 * Phase 4.5 follow-ups land here too:
 *   - 4.5.h — 2FA TOTP setup (locked Q4 — sprint scope)
 *   - email change flow (deferred from old "Coming soon" stub)
 *   - your-name editing (currently surfaces from onboarding)
 *
 * No EmployerShell wrapper here — the parent settings/layout.tsx
 * provides it.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordForm } from "../password-form";
import { DsoLogoUpload } from "../dso-logo-upload";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account · Settings" };

export default async function AccountSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let logoUrl: string | null = null;
  if (user) {
    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select("dso_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      const { data: dso } = await supabase
        .from("dsos")
        .select("logo_url")
        .eq("id", dsoUser.dso_id)
        .maybeSingle();
      logoUrl = (dso?.logo_url as string | null) ?? null;
    }
  }

  return (
    <div className="space-y-8 max-w-[760px]">
      <section className="border border-[var(--rule)] bg-white p-7 sm:p-8">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          DSO Profile
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Logo
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mb-6 max-w-[560px]">
          Used on your public company page, dashboard, and outbound
          candidate emails. Square aspect; transparent backgrounds work
          well.
        </p>
        <DsoLogoUpload initialUrl={logoUrl} />
      </section>

      <section className="border border-[var(--rule)] bg-white p-7 sm:p-8">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Password
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Set or change your password
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mb-6 max-w-[560px]">
          Setting a password lets you sign in without an emailed code each
          time. You can always fall back to a code if you forget it.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
