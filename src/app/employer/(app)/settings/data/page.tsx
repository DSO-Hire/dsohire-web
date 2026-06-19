/**
 * /employer/settings/data — Data & Deletion (Phase 4.5.g, owner-only).
 *
 * Two surfaces:
 *   1. Download my org data — ZIP export with every DSO-owned row + brand
 *      logos + photos. Owner-only.
 *   2. Delete this DSO — multi-step modal with type-DELETE gate +
 *      DSO-name match + Stripe cancel-at-period-end + soft-delete.
 *
 * Non-owners see a read-only notice explaining only the owner can run
 * org-level export or deletion. The data action also enforces this at
 * the server-action layer.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ShieldAlert } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { DataForm } from "./data-form";

export const metadata: Metadata = { title: "Data & deletion · Settings" };

export const dynamic = "force-dynamic";

/**
 * Settings layout (`/employer/settings/layout.tsx`) already provides the
 * EmployerShell + the outer "Configure DSO Hire for your team" header
 * + the SettingsNav rail. This page renders ONLY the inner content for
 * the right-hand column — no shell wrapper, no duplicate header.
 */
export default async function EmployerDataPage() {
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

  const role = (dsoUser as Record<string, unknown>).role as string;
  const dsoId = (dsoUser as Record<string, unknown>).dso_id as string;

  const { data: dso } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();

  const dsoName = (dso?.name as string | null) ?? "this DSO";

  return (
    <div className="max-w-[820px] space-y-6">
      <header>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Data &amp; deletion
        </div>
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.6px] text-ink leading-tight">
          Your org&apos;s data, your call
        </h2>
        <p className="mt-2 text-sm text-slate-body">
          Download every row tied to <strong>{dsoName}</strong>, or schedule
          the org for deletion. We make all of it cheap to do, and we never
          send your data anywhere you didn&apos;t explicitly ask us to.
        </p>
      </header>

      {role !== "owner" ? (
        <NonOwnerNotice />
      ) : (
        <DataForm dsoName={dsoName} />
      )}
    </div>
  );
}

function NonOwnerNotice() {
  return (
    <section className="border border-warning bg-warning-bg/40 p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
        <div>
          <h2 className="font-display text-base font-bold text-ink mb-1">
            Owner-only surface
          </h2>
          <p className="text-sm text-slate-body leading-relaxed">
            Only the DSO owner can export the organization&apos;s data or
            schedule it for deletion. Ask your owner to make these changes,
            or email{" "}
            <a
              href={SUPPORT_MAILTO}
              className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            if you need help.
          </p>
        </div>
      </div>
    </section>
  );
}
