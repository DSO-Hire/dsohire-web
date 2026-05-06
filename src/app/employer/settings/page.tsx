/**
 * /employer/settings — password + DSO logo upload (Phase 4.1.a).
 * Full DSO profile builder (name, slug, description, banner, photos)
 * lands in Phase 4.5.c.
 */

import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";
import { DsoLogoUpload } from "./dso-logo-upload";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Pull the current DSO logo so the upload component can render the
  // existing image as the idle-state preview.
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
    <EmployerShell active="settings">
      <header className="mb-10 max-w-[680px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Account Settings
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Settings
        </h1>
      </header>

      {/* DSO logo (Phase 4.1.a) — uploads + persists immediately. */}
      <section className="border border-[var(--rule)] bg-white p-7 sm:p-9 mb-8 max-w-[820px]">
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

      {/* Password section */}
      <section className="border border-[var(--rule)] bg-white p-7 sm:p-9 mb-8 max-w-[820px]">
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

      {/* Future sections — DSO profile fields beyond logo, notifications,
          team, billing — covered by Phase 4.3 / 4.5 */}
      <section className="border border-[var(--rule)] bg-cream p-7 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          More settings coming soon
        </div>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Full DSO profile (description, banner, photos), notification
          preferences, team roles, and account deletion are in the parity
          sprint backlog. For anything urgent, email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
          >
            cam@dsohire.com
          </a>
          .
        </p>
      </section>
    </EmployerShell>
  );
}
