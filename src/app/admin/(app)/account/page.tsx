/**
 * /admin/account — superadmin account security: set/change the password
 * used at /admin/sign-in, plus a pointer to 2FA enrollment. Inside the
 * (app) group, so the Tier-1 admin gate in the layout applies; the
 * founder allowlist is re-checked here since password changes are
 * founder-surface sensitive.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/gate";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Admin Account",
  robots: { index: false, follow: false },
};

export default async function AdminAccountPage() {
  const user = await requireSuperadmin("/admin/account");

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

      <section className="space-y-3 pt-6 border-t border-[var(--rule)]">
        <h2 className="text-base font-bold text-ink">Two-factor authentication</h2>
        <p className="text-sm text-slate-body max-w-md leading-relaxed">
          Strongly recommended for admin accounts. Enroll an authenticator app
          and every sign-in will require a second code from your phone.
        </p>
        <Link
          href="/auth/mfa/setup?next=/admin/account"
          className="inline-flex text-xs font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
        >
          Set up two-factor authentication →
        </Link>
      </section>
    </div>
  );
}
