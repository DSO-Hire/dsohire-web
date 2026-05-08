/**
 * /employer/restore — landing page for soft-deleted DSO orgs (Phase 4.5.g).
 *
 * Reachable when EmployerShell detects `dsos.deleted_at IS NOT NULL` and
 * redirects here. Owners see a Restore button; everyone else sees a
 * "ask the owner" notice.
 *
 * Page is OUTSIDE EmployerShell (would cause an infinite-redirect loop).
 * Bare-bones layout instead.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { RestoreForm } from "./restore-form";

export const metadata: Metadata = { title: "Restore your organization · DSO Hire" };

export const dynamic = "force-dynamic";

export default async function EmployerRestorePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) redirect("/employer/onboarding");

  const dsoId = (dsoUser as Record<string, unknown>).dso_id as string;
  const role = (dsoUser as Record<string, unknown>).role as string;
  const fullName =
    ((dsoUser as Record<string, unknown>).full_name as string | null) ??
    user.email ??
    "there";

  const { data: dso } = await supabase
    .from("dsos")
    .select("name, deleted_at")
    .eq("id", dsoId)
    .maybeSingle();

  if (!dso) redirect("/employer/onboarding");

  const deletedAt = (dso as Record<string, unknown>).deleted_at as string | null;
  if (!deletedAt) redirect("/employer/dashboard");

  const dsoName = (dso.name as string | null) ?? "your organization";

  const hardDeleteOn = new Date(
    new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000
  );
  // Server component running at request time — see candidate/restore
  // for the same pattern + rationale.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const daysRemaining = Math.max(
    0,
    Math.ceil((hardDeleteOn.getTime() - nowMs) / (24 * 60 * 60 * 1000))
  );

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
            Organization scheduled for deletion
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
            Welcome back, {fullName.split(" ")[0]}.
          </h1>
          <p className="text-sm text-slate-body leading-relaxed mb-2">
            <strong>{dsoName}</strong> was scheduled for deletion on{" "}
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

          {role === "owner" ? (
            <>
              <p className="text-sm text-slate-body leading-relaxed mb-6">
                Restore the organization now to bring everything back online —
                jobs go live again, your team regains access, and we&apos;ll
                un-cancel your Stripe subscription so billing continues
                seamlessly.
              </p>
              <RestoreForm canRestore />
            </>
          ) : (
            <>
              <p className="text-sm text-slate-body leading-relaxed mb-6">
                Only the DSO owner can restore. Reach out to your owner to
                ask them to sign in here, or email{" "}
                <a
                  href={SUPPORT_MAILTO}
                  className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                if you need help.
              </p>
              <RestoreForm canRestore={false} />
            </>
          )}

          <p className="mt-6 text-xs text-slate-meta">
            Need a hand?{" "}
            <a
              href={SUPPORT_MAILTO}
              className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
