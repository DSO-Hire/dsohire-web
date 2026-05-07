/**
 * /candidate/restore — landing page for soft-deleted candidates (Phase 4.5.g).
 *
 * Reachable when CandidateShell detects `candidates.deleted_at IS NOT NULL`
 * and redirects here. Renders a focused "Your account is scheduled for
 * deletion on X — restore now?" screen with two clear actions:
 *   • Restore (clears deleted_at, sends them back to dashboard)
 *   • Confirm + sign out (no-op + signs the user out)
 *
 * Page is OUTSIDE the CandidateShell guard — using the shell here would
 * cause an infinite-redirect loop. Bare-bones layout instead.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RestoreForm } from "./restore-form";

export const metadata: Metadata = { title: "Restore your account · DSO Hire" };

export const dynamic = "force-dynamic";

export default async function CandidateRestorePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/candidate/sign-in");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("full_name, deleted_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) redirect("/candidate/sign-up");

  const deletedAt = (candidate as Record<string, unknown>).deleted_at as
    | string
    | null;

  // If they're not actually deleted, bounce them back to the dashboard.
  if (!deletedAt) redirect("/candidate/dashboard");

  const hardDeleteOn = new Date(
    new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000
  );
  const daysRemaining = Math.max(
    0,
    Math.ceil((hardDeleteOn.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  const candidateName =
    (candidate.full_name as string | null) ?? user.email ?? "there";

  return (
    <main className="min-h-screen bg-ivory flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex items-center gap-2">
          <Image
            src="/dso-hire-logo.svg"
            alt="DSO Hire"
            width={120}
            height={36}
            priority
          />
        </div>

        <div className="border border-amber-200 bg-amber-50/40 p-6 sm:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900">
            Account scheduled for deletion
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
            Welcome back, {candidateName.split(" ")[0]}.
          </h1>
          <p className="text-sm text-slate-body leading-relaxed mb-2">
            Your account was scheduled for deletion on{" "}
            <strong>
              {new Date(deletedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            . We&apos;ll permanently delete it on{" "}
            <strong>
              {hardDeleteOn.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>{" "}
            ({daysRemaining} day{daysRemaining === 1 ? "" : "s"} from now).
          </p>
          <p className="text-sm text-slate-body leading-relaxed mb-6">
            Restore it now to keep using DSO Hire — your profile, applications,
            and credentials all come back intact.
          </p>

          <RestoreForm />

          <p className="mt-6 text-xs text-slate-meta">
            Need a hand?{" "}
            <a
              href="mailto:cam@dsohire.com"
              className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              cam@dsohire.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
