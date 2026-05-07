/**
 * /employer/settings/account — Account category (Phase 4.5.a).
 *
 * The default landing page for /employer/settings (the bare /settings
 * route redirects here). Now credentials-only — the DSO logo moved to
 * /employer/settings/profile in Phase 4.5.d, where it semantically
 * belongs alongside banner + photos + culture chips.
 *
 * Phase 4.5 follow-ups land here too:
 *   - 4.5.h — 2FA TOTP setup (locked Q4 — sprint scope)
 *   - email change flow (deferred from old "Coming soon" stub)
 *   - your-name editing (currently surfaces from onboarding)
 *
 * No EmployerShell wrapper here — the parent settings/layout.tsx
 * provides it.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PasswordForm } from "../password-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account · Settings" };

export default async function AccountSettingsPage() {
  return (
    <div className="space-y-8 max-w-[760px]">
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

      <Link
        href="/employer/settings/profile"
        className="group flex items-center justify-between gap-4 border border-[var(--rule)] bg-cream/40 p-5 hover:bg-cream/70"
      >
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Looking for your logo?
          </div>
          <p className="text-sm text-slate-body leading-relaxed">
            Logo, banner, photos, mission, and culture chips all live in
            Public profile now.
          </p>
        </div>
        <ArrowRight className="size-4 text-slate-meta group-hover:text-heritage-deep" />
      </Link>
    </div>
  );
}
