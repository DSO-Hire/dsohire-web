/**
 * /candidate/settings — for now, password set/change. Notification preferences,
 * account deletion, etc. ship in a follow-up sprint.
 */

import Link from "next/link";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { PasswordForm } from "./password-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function CandidateSettingsPage() {
  return (
    <CandidateShell active="settings">
      <header className="mb-10 max-w-[680px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Account Settings
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Settings
        </h1>
      </header>

      <section className="border border-[var(--rule)] bg-white p-7 sm:p-9 mb-8 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Password
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Set or change your password
        </h2>
        <p className="text-[13px] text-slate-body leading-relaxed mb-6 max-w-[560px]">
          Setting a password lets you sign in without an emailed code each
          time. You can always fall back to a code if you forget it.
        </p>
        <PasswordForm />
      </section>

      <section className="border border-[var(--rule)] bg-cream p-7 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          More settings coming soon
        </div>
        <p className="text-[13px] text-slate-body leading-relaxed mb-4">
          Notification preferences, email change, and account deletion ship
          in a follow-up release. For anything urgent, email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
          >
            cam@dsohire.com
          </a>
          .
        </p>
        <ul className="list-none space-y-2 mt-4 pt-4 border-t border-[var(--rule)]">
          <li>
            <Link
              href="/candidate/profile"
              className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Edit your profile →
            </Link>
          </li>
          <li>
            <Link
              href="/legal/privacy"
              className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Privacy policy →
            </Link>
          </li>
          <li>
            <Link
              href="/legal/candidate-terms"
              className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Candidate terms →
            </Link>
          </li>
        </ul>
      </section>
    </CandidateShell>
  );
}
