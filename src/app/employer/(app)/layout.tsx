/**
 * Shelled employer app layout — the auth gate + persistent nav for every
 * authed employer surface (/employer/dashboard, /jobs, /pipeline,
 * /applications, /talent-pool, /candidates, /inbox, /analytics, /locations,
 * /team, /billing, /automations, /offer-approvals, /settings, /help,
 * /checkout, …).
 *
 * `(app)` is a route GROUP — it does not change URLs, so this still serves
 * /employer/dashboard etc. Because a layout persists across navigation, the
 * EmployerShell rail no longer unmounts/remounts when moving between pages
 * (the old "blink"), and the content-area BrandLoader (./loading.tsx) shows
 * with the nav still in place while a page's server data loads.
 *
 * The auth gate + identity / capability / inbox / location resolution used to
 * live inside EmployerShell (rendered per page). It moved up here so it runs
 * once and the shell can be purely presentational. Redirects are
 * byte-identical to the old shell.
 *
 * Shell-less employer routes (sign-in, sign-up, sign-out, restore, the
 * invite-accept page, and the chrome-less onboarding wizard) deliberately
 * live OUTSIDE this group. Onboarding in particular MUST stay out: it's the
 * redirect target for users with no dso_users row, so nesting it here would
 * loop (layout → onboarding → layout → …).
 */

import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePermissions } from "@/lib/permissions/capabilities";
import { getUnreadCount, getNewApplicationCount } from "@/lib/inbox/queries";
import { getMfaState } from "@/lib/auth/mfa";
import { readMfaTrustCookie } from "@/lib/auth/mfa-trust";
import { getActiveLocationId } from "@/lib/employer/active-location";
import { EmployerShell, type Role } from "@/components/employer/employer-shell";

export default async function EmployerAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) redirect("/employer/onboarding");

  const { data: dso } = await supabase
    .from("dsos")
    .select("id, name, slug, status, logo_url, require_mfa, deleted_at")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  // ── Soft-deleted DSO guard (Phase 4.5.g) ──
  // If the DSO is soft-deleted, every team member hits the restore
  // landing page until the owner restores or the cron hard-deletes.
  if ((dso as Record<string, unknown> | null)?.deleted_at) {
    redirect("/employer/restore");
  }

  // ── MFA enforcement (Phase 4.5.d, refined Day 21) ──
  // Per-DSO opt-in via dso.require_mfa. Enrolled users step up to aal2
  // on each page hit UNLESS a valid 30-day trust-this-device cookie is
  // present (mfa-trust.ts) — matches industry standard (Stripe / GitHub /
  // Salesforce all do this). Sensitive actions still re-check via
  // userNeedsMfaChallenge regardless of trust.
  const mfaState = await getMfaState(supabase);
  const dsoRequiresMfa = (dso?.require_mfa as boolean | null) === true;
  if (mfaState.isEnrolled && mfaState.currentLevel !== "aal2") {
    const cookieStore = await cookies();
    const trusted = readMfaTrustCookie(cookieStore, {
      authUserId: user.id,
      verifiedFactorId: mfaState.verifiedFactorId,
    });
    if (!trusted) {
      redirect("/auth/mfa/challenge?next=/employer/dashboard");
    }
  }
  if (dsoRequiresMfa && !mfaState.isEnrolled) {
    redirect("/auth/mfa/setup");
  }

  const role = dsoUser.role as Role;

  // #83 Phase 2 — nav visibility is capability-driven (role preset +
  // per-teammate overrides) instead of hard role lists.
  const navPerms = effectivePermissions(
    role,
    (dsoUser as Record<string, unknown>).permission_overrides
  );

  // Inbox unread badge — counts messages from candidates that this user
  // (or any DSO teammate) hasn't marked read.
  // Applications new-count badge — Cam's sharpened ask 2026-05-15.
  // Counts applications currently sitting in an `open`-kind pipeline
  // stage. Both queries lean on RLS to scope to this DSO.
  const [inboxUnread, newApplications] = await Promise.all([
    getUnreadCount(supabase, "employer"),
    getNewApplicationCount(supabase),
  ]);

  // N12 — pending-offer-approvals badge for approvers.
  // RLS scopes application_offer_sends to this DSO via the join.
  let pendingApprovals = 0;
  if (navPerms["offers.approve"]) {
    const { count } = await supabase
      .from("application_offer_sends")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending");
    pendingApprovals = count ?? 0;
  }

  const dsoName = (dso?.name as string | undefined) ?? "Pending";
  const dsoLogo = (dso?.logo_url as string | null) ?? null;
  const dsoStatus = (dso?.status as string | undefined) ?? "pending";
  const userFullName =
    (dsoUser.full_name as string | null) ?? user.email ?? "You";

  // ─── Multi-location switcher data (Phase 4.6.d) ───
  const [activeLocationId, { data: locationRows }] = await Promise.all([
    getActiveLocationId(),
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoUser.dso_id)
      .order("name", { ascending: true }),
  ]);
  const locations = ((locationRows ?? []) as Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }>).map((l) => ({
    id: l.id,
    name: l.name,
    subtitle: [l.city, l.state].filter(Boolean).join(", ") || null,
  }));
  const activeLocation = activeLocationId
    ? locations.find((l) => l.id === activeLocationId) ?? null
    : null;

  return (
    <EmployerShell
      navPerms={navPerms}
      inboxUnread={inboxUnread}
      newApplications={newApplications}
      pendingApprovals={pendingApprovals}
      role={role}
      dsoName={dsoName}
      dsoLogo={dsoLogo}
      dsoStatus={dsoStatus}
      userFullName={userFullName}
      locations={locations}
      activeLocationId={activeLocationId}
      activeLocation={activeLocation}
      authUserId={user.id}
      dsoId={dsoUser.dso_id as string}
    >
      {children}
    </EmployerShell>
  );
}
