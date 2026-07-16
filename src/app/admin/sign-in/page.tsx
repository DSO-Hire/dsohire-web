/**
 * /admin/sign-in — dedicated superadmin sign-in, separate from the employer
 * and candidate flows. Lives OUTSIDE the (app) route group so the Tier-1
 * admin gate doesn't apply to the page itself. Never linked from public
 * navigation and noindexed; the real protection is the server-side email
 * allowlist + admin_users check in ./actions.ts, which returns generic
 * errors for non-admin emails so the page confirms nothing.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { AdminSignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Admin Sign In",
  robots: { index: false, follow: false },
};

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in as an admin? Straight through.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isSuperadminEmail(user.email)) {
    const dest = next && /^\/admin(\/|$)/.test(next) ? next : "/admin";
    redirect(dest);
  }

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center bg-white/10 border border-white/20">
            <ShieldCheck className="h-5 w-5 text-white/80" />
          </div>
          <div>
            <div className="text-2xs font-bold tracking-[3px] uppercase text-white/50">
              DSO Hire
            </div>
            <h1 className="text-lg font-bold text-white leading-tight">
              Admin Console
            </h1>
          </div>
        </div>

        <div className="border border-white/12 bg-white/[0.03] p-7">
          <AdminSignInForm next={next} />
        </div>

        <p className="mt-6 text-xs text-white/40 leading-relaxed text-center">
          Restricted area. Access is limited to authorized DSO Hire staff and
          all sign-in activity is logged.
        </p>
      </div>
    </main>
  );
}
