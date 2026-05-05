/**
 * /employer/settings — for now, password set/change. Full DSO profile editing
 * (name, slug, logo, description) ships in a follow-up sprint.
 */

import { EmployerShell } from "@/components/employer/employer-shell";
import { PasswordForm } from "./password-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
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

      {/* Future sections — DSO profile, notifications, team, billing */}
      <section className="border border-[var(--rule)] bg-cream p-7 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          More settings coming soon
        </div>
        <p className="text-[14px] text-slate-body leading-relaxed">
          DSO profile (name, slug, logo, description), notification
          preferences, and account deletion ship in a follow-up release. For
          anything urgent, email{" "}
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
