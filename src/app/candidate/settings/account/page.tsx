/**
 * /candidate/settings/account — Phase 4.3.a (v1).
 *
 * Today: password set/change (existing PasswordForm). Email change with
 * verify-new-before-swap, phone capture for SMS opt-in, and language
 * stub are queued for a follow-up sub-pass; not blocking the IA scaffold.
 */

import Link from "next/link";
import { PasswordForm } from "../password-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account · Settings" };

export default function CandidateSettingsAccountPage() {
  return (
    <div className="space-y-6">
      <section className="border border-[var(--rule)] bg-white p-7 sm:p-9">
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

      <section className="border border-[var(--rule)] bg-cream p-7">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Coming soon to Account
        </div>
        <p className="text-[14px] text-slate-body leading-relaxed mb-4">
          Email change with verify-new-before-swap, phone capture for SMS
          opt-in, and language preferences ship in a follow-up release.
          For anything urgent, email{" "}
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
              className="text-[14px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Edit your profile →
            </Link>
          </li>
          <li>
            <Link
              href="/legal/privacy"
              className="text-[14px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Privacy policy →
            </Link>
          </li>
          <li>
            <Link
              href="/legal/candidate-terms"
              className="text-[14px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Candidate terms →
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
