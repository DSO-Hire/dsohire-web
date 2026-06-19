/**
 * /auth/mfa/challenge — sign-in step-up to aal2 (Phase 4.5.d / 2FA TOTP).
 *
 * Reachable only after primary auth (OTP / password). Server-side guard:
 *   - If user isn't signed in → redirect to /employer/sign-in.
 *   - If session already aal2 → forward to ?next=… (default dashboard).
 *   - If user has no verified factor → forward (no challenge needed).
 *   - Otherwise render the challenge form (TOTP code or recovery code).
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaState } from "@/lib/auth/mfa";
import { ChallengeForm } from "./challenge-form";

export const metadata: Metadata = {
  title: "Two-factor sign-in · DSO Hire",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function MfaChallengePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const next = isSafeNext(sp.next ?? "") ? sp.next ?? null : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const state = await getMfaState(supabase);
  if (state.currentLevel === "aal2") {
    redirect(next ?? "/employer/dashboard");
  }
  if (!state.isEnrolled) {
    redirect(next ?? "/employer/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream/30 px-6 py-12">
      <div className="w-full max-w-[440px] rounded border border-[var(--rule)] bg-card p-8 sm:p-10">
        <div className="mb-6 inline-flex items-center gap-2.5 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          <ShieldCheck className="size-3.5" />
          Two-factor sign-in
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2 leading-tight">
          One more step.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed mb-6">
          Enter the 6-digit code from your authenticator app to finish
          signing in. Lost your device? Use one of your recovery codes
          instead — each works once.
        </p>
        <ChallengeForm next={next} />
      </div>
    </main>
  );
}

function isSafeNext(next: string): boolean {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}
