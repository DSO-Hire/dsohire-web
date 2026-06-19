/**
 * /employer/settings/account — Account category (Phase 4.5.a + 4.5.d).
 *
 * The default landing page for /employer/settings. Credentials-only +
 * MFA — the DSO logo moved to /employer/settings/profile in Phase 4.5.d
 * where it belongs alongside banner + photos + culture chips.
 *
 * Sections:
 *   - Password (set / change)
 *   - 2FA two-factor authentication (4.5.d)
 *   - Org-wide MFA toggle (Enterprise + owner only)
 *
 * No EmployerShell wrapper here — the parent settings/layout.tsx
 * provides it.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PasswordForm } from "../password-form";
import { MfaSection } from "./mfa-section";
import { ProfileCard } from "./profile-card";
import { TimezoneCard } from "@/components/settings/timezone-card";
import { updatePreferredTimezone } from "./actions";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { getMfaState } from "@/lib/auth/mfa";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account · Settings" };

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defaults for the unauthenticated/edge case (settings layout already
  // protects the route, so this is mostly defensive).
  let mfaInitialEnrolled = false;
  let mfaFactorId: string | null = null;
  let remainingRecoveryCodes = 0;
  let isOwner = false;
  let isEnterprise = false;
  let initialRequireMfa = false;
  let preferredTimezone = "America/Chicago";
  let profile = {
    firstName: "",
    lastName: "",
    title: "",
    pronouns: "",
    phone: "",
    bio: "",
    avatarUrl: null as string | null,
    workBase: "",
    baseLocationId: "",
    coverageArea: "",
  };
  let locationOptions: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }> = [];

  if (user) {
    const mfaState = await getMfaState(supabase);
    mfaInitialEnrolled = mfaState.isEnrolled;
    mfaFactorId = mfaState.verifiedFactorId;

    // Recovery code count uses service-role to avoid an RLS round trip.
    const admin = createSupabaseServiceRoleClient();
    const { count } = await admin
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("auth_user_id", user.id)
      .is("used_at", null);
    remainingRecoveryCodes = count ?? 0;

    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select(
        "dso_id, role, preferred_timezone, first_name, last_name, title, pronouns, phone, bio, avatar_url, work_base, base_location_id, coverage_area"
      )
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      isOwner = (dsoUser.role as string) === "owner";
      preferredTimezone =
        (dsoUser.preferred_timezone as string | null) ?? "America/Chicago";
      profile = {
        firstName: (dsoUser.first_name as string | null) ?? "",
        lastName: (dsoUser.last_name as string | null) ?? "",
        title: (dsoUser.title as string | null) ?? "",
        pronouns: (dsoUser.pronouns as string | null) ?? "",
        phone: (dsoUser.phone as string | null) ?? "",
        bio: (dsoUser.bio as string | null) ?? "",
        avatarUrl: (dsoUser.avatar_url as string | null) ?? null,
        workBase: (dsoUser.work_base as string | null) ?? "",
        baseLocationId: (dsoUser.base_location_id as string | null) ?? "",
        coverageArea: (dsoUser.coverage_area as string | null) ?? "",
      };

      const { data: locs } = await supabase
        .from("dso_locations")
        .select("id, name, city, state")
        .eq("dso_id", dsoUser.dso_id as string)
        .order("name", { ascending: true });
      locationOptions = (locs ?? []) as typeof locationOptions;
      const sub = await getActiveSubscription(
        supabase,
        dsoUser.dso_id as string
      );
      isEnterprise = sub?.tier === "enterprise";

      const { data: dsoRow } = await supabase
        .from("dsos")
        .select("require_mfa")
        .eq("id", dsoUser.dso_id as string)
        .maybeSingle();
      initialRequireMfa = (dsoRow?.require_mfa as boolean) ?? false;
    }
  }

  return (
    <div className="space-y-8 max-w-[760px]">
      <ProfileCard
        email={user?.email ?? ""}
        locations={locationOptions}
        initial={profile}
      />

      <section className="border border-[var(--rule)] bg-card p-7 sm:p-8">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Password
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Set or change your password
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mb-6 max-w-[560px]">
          Setting a password lets you sign in without an emailed code each
          time. You can always fall back to a code if you forget it.
        </p>
        <PasswordForm />
      </section>

      <MfaSection
        initialEnrolled={mfaInitialEnrolled}
        initialFactorId={mfaFactorId}
        remainingRecoveryCodes={remainingRecoveryCodes}
        isOwner={isOwner}
        isEnterprise={isEnterprise}
        initialRequireMfa={initialRequireMfa}
      />

      <TimezoneCard
        initialTimezone={preferredTimezone}
        action={updatePreferredTimezone}
      />

      <Link
        href="/employer/settings/profile"
        className="group flex items-center justify-between gap-4 border border-[var(--rule)] bg-cream/40 p-5 hover:bg-cream/70"
      >
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Looking for your logo?
          </div>
          <p className="text-sm text-slate-body leading-relaxed">
            Logo, banner, photos, mission, and culture chips all live in
            Public profile now.
          </p>
        </div>
        <ArrowRight className="size-4 text-slate-meta group-hover:text-heritage-deep" />
      </Link>
    </div>
  );
}
