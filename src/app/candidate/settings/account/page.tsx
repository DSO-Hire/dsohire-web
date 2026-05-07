/**
 * /candidate/settings/account — Phase 4.3.a v2.
 *
 * Four sections:
 *   1. Password (existing — set/change via Supabase Auth)
 *   2. Email — verify-new-before-swap via Supabase Auth's updateUser
 *   3. Phone — capture for future SMS opt-in (writes candidates.phone)
 *   4. Language — stub, English-only at launch
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordForm } from "../password-form";
import {
  EmailChangeForm,
  PhoneForm,
  LanguageStub,
} from "./account-form";

export const metadata: Metadata = { title: "Account · Settings" };

export default async function CandidateSettingsAccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/account");

  const [{ data: candidate }, { data: pendingRows }] = await Promise.all([
    supabase
      .from("candidates")
      .select("phone")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("pending_email_changes")
      .select("id, new_email, expires_at, created_at")
      .eq("candidate_user_id", user.id)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const phone = (candidate?.phone as string | null) ?? null;
  const pendingRow = (pendingRows?.[0] ?? null) as
    | {
        id: string;
        new_email: string;
        expires_at: string;
        created_at: string;
      }
    | null;

  return (
    <div className="space-y-6">
      <PasswordSection />
      <EmailChangeForm
        currentEmail={user.email ?? null}
        initialPending={pendingRow}
      />
      <PhoneForm initialPhone={phone} />
      <LanguageStub />

      <section className="border border-[var(--rule)] bg-cream p-7">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Quick links
        </div>
        <ul className="list-none space-y-2">
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

// Password section keeps the existing PasswordForm but inside the new
// section-card style for visual consistency with Email + Phone.
function PasswordSection() {
  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4D7A60]/10">
          <PasswordIcon />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            Password
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Set or change your password. You can always fall back to an
            emailed code if you forget it.
          </p>
        </div>
      </header>
      <PasswordForm />
    </section>
  );
}

function PasswordIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[#4D7A60]"
      aria-hidden
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
