/**
 * /candidate/claim — guest-account claim landing (E2.1 / Phase 5F).
 *
 * Reachable from the magic link in the guest-apply confirmation email.
 * Query params:
 *   - email  (required) — the email the application was filed under
 *   - next   (optional) — redirect target after auth/callback runs
 *
 * Server-side, we trigger a signInWithOtp for the email so the user
 * gets a fresh magic link in their inbox. They click → /auth/callback
 * runs the guest-claim path (links auth_user_id, flips is_guest=false)
 * → redirects to `next` (default /candidate/dashboard).
 *
 * This page exists primarily as a re-issue button. If the user lost the
 * original confirmation email, this is where we surface a "send me a
 * new link" form. No password required end-to-end.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

interface PageProps {
  searchParams: Promise<{
    email?: string;
    next?: string;
    sent?: string;
    error?: string;
  }>;
}

export const metadata: Metadata = { title: "Claim your account · DSO Hire" };

export default async function ClaimPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  const next =
    sp.next?.startsWith("/candidate") || sp.next?.startsWith("/jobs/")
      ? sp.next
      : "/candidate/dashboard";

  return (
    <SiteShell>
      <div className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[640px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
          Claim your account
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] leading-[1.1] text-ink mb-4">
          Sign in to track your application
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed mb-8 max-w-[480px]">
          You applied as a guest. Enter your email and we&apos;ll send you a
          magic link &mdash; click it and your guest profile becomes a full
          DSO Hire account. No password required.
        </p>

        {sp.sent === "1" ? (
          <section className="border-l-4 border-heritage bg-cream p-6">
            <CheckCircle2
              className="h-7 w-7 text-heritage-deep mb-3"
              aria-hidden
            />
            <h2 className="text-lg font-extrabold tracking-[-0.3px] text-ink mb-2">
              Check your inbox
            </h2>
            <p className="text-[14px] text-ink leading-relaxed">
              We sent a magic link to <strong>{email}</strong>. Click it to
              finish claiming your account. The link works once and expires
              in 1 hour.
            </p>
          </section>
        ) : (
          <form action={sendClaimLink} className="space-y-5">
            <input type="hidden" name="next" value={next} />
            {sp.error === "1" && (
              <div
                role="alert"
                className="bg-danger-bg border-l-4 border-danger p-4"
              >
                <p className="text-[14px] text-danger leading-relaxed">
                  We couldn&apos;t send your magic link. Check your spam folder
                  for a recent email, wait a few minutes, or try again.
                </p>
              </div>
            )}
            <div>
              <label
                htmlFor="claim-email"
                className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
              >
                Email <span className="text-heritage">*</span>
              </label>
              <input
                id="claim-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                defaultValue={email}
                className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Send me a magic link
            </button>
          </form>
        )}

        <div className="mt-12 pt-8 border-t border-[var(--rule)]">
          <p className="text-[13px] text-slate-body leading-relaxed">
            Already have an account?{" "}
            <Link
              href={`/candidate/sign-in?next=${encodeURIComponent(next)}`}
              className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Sign in instead
            </Link>
            .
          </p>
        </div>
      </div>
    </SiteShell>
  );
}

async function sendClaimLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/candidate/dashboard");
  if (!email) return;

  const admin = createSupabaseServiceRoleClient();
  // Send OTP magic link. shouldCreateUser=true so an auth.users row is
  // created on first verify; on callback we detect the email match to
  // the guest candidate and promote.
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com"}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(
      `/candidate/claim?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}&error=1`
    );
  }

  redirect(
    `/candidate/claim?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}&sent=1`
  );
}
