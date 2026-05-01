/**
 * /candidate/settings — placeholder for now. Account-level settings
 * (email change, notification preferences, account deletion) ship in v1.1.
 */

import Link from "next/link";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function CandidateSettingsPage() {
  return (
    <CandidateShell active="settings">
      <header className="mb-10 max-w-[720px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Account Settings
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-3">
          Coming soon.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Notification preferences, email change, and account deletion ship in
          the v1.1 release. For anything urgent, email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
          >
            cam@dsohire.com
          </a>
          .
        </p>
      </header>

      <div className="border border-[var(--rule)] bg-white p-6 max-w-[560px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Quick Links
        </div>
        <ul className="list-none space-y-2.5">
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
      </div>
    </CandidateShell>
  );
}
