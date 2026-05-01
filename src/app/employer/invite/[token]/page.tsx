/**
 * /employer/invite/[token] — public invitation accept page.
 *
 * Validates the token via service-role lookup (no public RLS read on
 * dso_invitations — service-role bypass is the canonical read path here,
 * which prevents probing for valid tokens).
 *
 * Possible states:
 *   - Token doesn't exist / expired / revoked / already accepted → 404
 *     copy with explanation
 *   - User not signed in → CTA to sign in (preserves return URL)
 *   - User signed in but already a member of a DIFFERENT DSO → blocked
 *     (the unique constraint on dso_users.auth_user_id only allows one
 *     DSO per auth user)
 *   - User signed in and not in any DSO → "Accept and join" button →
 *     creates dso_users row + marks invitation accepted_at, redirects
 *     to /employer/dashboard
 *   - User signed in and already in this DSO → friendly message + link
 *     to dashboard
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { acceptInvitation } from "../actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join your team",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
};

export default async function InviteAcceptPage({ params }: PageProps) {
  const { token } = await params;

  if (!token || token.length < 16) notFound();

  const admin = createSupabaseServiceRoleClient();

  const { data: invitation } = await admin
    .from("dso_invitations")
    .select(
      "id, dso_id, email, role, expires_at, accepted_at, revoked_at, invited_by"
    )
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return <ErrorScreen title="This invitation link isn't valid." />;
  }

  if (invitation.accepted_at) {
    return (
      <ErrorScreen
        title="This invitation was already accepted."
        body="If that was you, head to your dashboard. Otherwise the invite has been used."
        cta={{ href: "/employer/dashboard", label: "Go to Dashboard" }}
      />
    );
  }
  if (invitation.revoked_at) {
    return (
      <ErrorScreen
        title="This invitation was revoked."
        body="The DSO that invited you canceled the invite. Reach out to them directly if you think this was a mistake."
      />
    );
  }
  if (isExpired(invitation.expires_at as string)) {
    return (
      <ErrorScreen
        title="This invitation expired."
        body="Invitations are valid for 7 days. Ask the DSO to send a fresh one."
      />
    );
  }

  // Pull DSO + inviter context for the page copy
  const [{ data: dso }, { data: inviter }] = await Promise.all([
    admin.from("dsos").select("id, name").eq("id", invitation.dso_id as string).maybeSingle(),
    invitation.invited_by
      ? admin
          .from("dso_users")
          .select("full_name")
          .eq("id", invitation.invited_by as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const dsoName = (dso?.name as string | undefined) ?? "the team";
  const inviterName = (inviter?.full_name as string | null) ?? "Your teammate";
  const role = invitation.role as string;

  // Now check the auth state of the visitor
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → route through sign-in (then return here)
  if (!user) {
    return (
      <AcceptShell>
        <Header dsoName={dsoName} inviterName={inviterName} role={role} />
        <p className="mt-6 text-[15px] text-slate-body leading-[1.7]">
          Sign in or create an account first — the email you use must match{" "}
          <strong className="text-ink font-semibold">
            {invitation.email as string}
          </strong>
          .
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/employer/sign-in?next=${encodeURIComponent(`/employer/invite/${token}`)}`}
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Sign In to Accept
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/employer/sign-up?next=${encodeURIComponent(`/employer/invite/${token}`)}`}
            className="inline-flex items-center gap-2.5 px-7 py-4 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            New to DSO Hire? Sign Up
          </Link>
        </div>
      </AcceptShell>
    );
  }

  // Check if this auth user already has a dso_users row (anywhere)
  const { data: existingMembership } = await admin
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    if (existingMembership.dso_id === invitation.dso_id) {
      return (
        <AcceptShell>
          <CheckCircle2 className="h-10 w-10 text-heritage mb-5" />
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
            You&apos;re already on this team.
          </h1>
          <p className="mt-4 text-base text-slate-body leading-[1.7] max-w-[640px]">
            You&apos;re already a member of <strong>{dsoName}</strong>. Head
            to the dashboard to keep working.
          </p>
          <Link
            href="/employer/dashboard"
            className="mt-8 inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AcceptShell>
      );
    }

    // Member of a DIFFERENT DSO — blocked
    return (
      <AcceptShell>
        <AlertTriangle className="h-10 w-10 text-yellow-700 mb-5" />
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          You&apos;re already on another DSO&apos;s team.
        </h1>
        <p className="mt-4 text-base text-slate-body leading-[1.7] max-w-[640px]">
          DSO Hire accounts can only be members of one DSO at a time. To
          accept this invitation, the existing DSO would need to remove you
          first — or use a different email to sign up fresh.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/employer/dashboard"
            className="inline-flex items-center gap-2.5 px-7 py-4 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            Back to Current DSO
          </Link>
          <a
            href="mailto:cam@dsohire.com?subject=Invitation%20question"
            className="inline-flex items-center gap-2.5 px-7 py-4 text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
          >
            Contact Support
          </a>
        </div>
      </AcceptShell>
    );
  }

  // Signed in, no existing DSO membership → ready to accept
  return (
    <AcceptShell>
      <Header dsoName={dsoName} inviterName={inviterName} role={role} />
      <form action={acceptInvitation} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
        >
          Accept &amp; Join {dsoName}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-4 text-[12px] text-slate-meta">
        Signed in as <strong className="text-ink">{user.email}</strong>.{" "}
        <Link
          href="/employer/sign-in"
          className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
        >
          Use a different account
        </Link>
      </p>
    </AcceptShell>
  );
}

/* ───── shared layout ───── */

function AcceptShell({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[820px] mx-auto">
        {children}
      </section>
    </SiteShell>
  );
}

function Header({
  dsoName,
  inviterName,
  role,
}: {
  dsoName: string;
  inviterName: string;
  role: string;
}) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <>
      <div className="flex items-center gap-3.5 mb-6">
        <span className="block w-7 h-px bg-heritage" />
        <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
          Team Invitation
        </span>
      </div>
      <h1 className="text-3xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-5">
        Join {dsoName} on DSO Hire.
      </h1>
      <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px]">
        <strong className="text-ink">{inviterName}</strong> invited you to
        join <strong className="text-ink">{dsoName}</strong> as a{" "}
        <strong className="text-ink">{roleLabel}</strong>.
      </p>
    </>
  );
}

/* Hoisted out of the render path so the Date.now() call doesn't trip
   react-hooks/purity (which is over-eager about server components). */
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < new Date().getTime();
}

function ErrorScreen({
  title,
  body,
  cta,
}: {
  title: string;
  body?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <AcceptShell>
      <AlertTriangle className="h-10 w-10 text-slate-meta mb-5" />
      <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
        {title}
      </h1>
      {body && (
        <p className="mt-4 text-base text-slate-body leading-[1.7] max-w-[640px]">
          {body}
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        {cta && (
          <Link
            href={cta.href}
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            {cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <a
          href="mailto:cam@dsohire.com"
          className="inline-flex items-center gap-2.5 px-7 py-4 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
        >
          Contact Support
        </a>
      </div>
    </AcceptShell>
  );
}

