"use server";

/**
 * Employer-side account settings server actions.
 *
 * MFA-specific actions live in `mfa-actions.ts` (Phase 4.5.d). This file
 * houses non-MFA account-tab actions — currently the preferred-timezone
 * write added 2026-05-18 to fix the UTC-leakage bug surfaced in Erica's
 * testing pass.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Persists `dso_users.preferred_timezone` for the authenticated employer.
 * Validated against the US_TIMEZONES allowlist server-side so the column
 * never holds garbage that would later crash `Intl.DateTimeFormat`.
 */
export async function updatePreferredTimezone(
  timezone: string
): Promise<Result> {
  const { US_TIMEZONES } = await import("@/lib/timezones");
  const allowed = US_TIMEZONES.some((t) => t.id === timezone);
  if (!allowed) {
    return { ok: false, error: "Pick a timezone from the list." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("dso_users")
    .update({ preferred_timezone: timezone })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[employer/settings/account] updatePreferredTimezone", error);
    return { ok: false, error: "Couldn't save your timezone." };
  }
  revalidatePath("/employer/settings/account");
  return { ok: true };
}

/**
 * Persist the signed-in teammate's own identity fields. Writes ONLY
 * profile columns — never `role` or `dso_id` — so even though the
 * underlying RLS self-update policy is column-agnostic, this path can't
 * be used for privilege escalation. `full_name` is a generated column
 * (first || ' ' || last), so we never write it directly.
 */
export async function updateMyProfile(input: {
  firstName: string;
  lastName: string;
  title: string;
  pronouns: string;
  phone: string;
  bio: string;
  workBase: string; // "" | "corporate" | "practice" | "regional"
  baseLocationId: string; // "" when not practice-based
  coverageArea: string; // free text when regional
}): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // Trim + cap everything so the columns never hold runaway input.
  const clip = (v: string, max: number) => v.trim().slice(0, max);
  const firstName = clip(input.firstName, 80);
  const lastName = clip(input.lastName, 80);
  const title = clip(input.title, 120);
  const pronouns = clip(input.pronouns, 40);
  const phone = clip(input.phone, 40);
  const bio = clip(input.bio, 600);

  if (!firstName && !lastName) {
    return { ok: false, error: "Add at least a first or last name." };
  }

  // ── Work base: validate the mode, then keep only the field that mode uses.
  const workBase =
    input.workBase === "corporate" ||
    input.workBase === "practice" ||
    input.workBase === "regional"
      ? input.workBase
      : null;

  let baseLocationId: string | null = null;
  let coverageArea: string | null = null;

  if (workBase === "practice") {
    const locId = input.baseLocationId.trim();
    if (!locId) {
      return { ok: false, error: "Pick the practice you're based at." };
    }
    // Resolve the caller's DSO, then confirm the location belongs to it —
    // never trust a client-supplied location id without an ownership check.
    const { data: me } = await supabase
      .from("dso_users")
      .select("dso_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const { data: loc } = await supabase
      .from("dso_locations")
      .select("id, dso_id")
      .eq("id", locId)
      .maybeSingle();
    if (!me || !loc || loc.dso_id !== me.dso_id) {
      return { ok: false, error: "That location isn't part of your group." };
    }
    baseLocationId = locId;
  } else if (workBase === "regional") {
    coverageArea = clip(input.coverageArea, 200);
  }

  const { error } = await supabase
    .from("dso_users")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      title: title || null,
      pronouns: pronouns || null,
      phone: phone || null,
      bio: bio || null,
      work_base: workBase,
      base_location_id: baseLocationId,
      coverage_area: coverageArea,
    })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[employer/settings/account] updateMyProfile", error);
    return { ok: false, error: "Couldn't save your profile." };
  }
  revalidatePath("/employer/settings/account");
  revalidatePath("/employer/team");
  return { ok: true };
}

/**
 * Persist a freshly-uploaded avatar URL to dso_users.avatar_url for the
 * signed-in teammate. Mirrors the candidate-side instant-save pattern —
 * a new photo lands immediately, no Save button. Pass null to clear.
 */
export async function setMyAvatarUrl(url: string | null): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("dso_users")
    .update({ avatar_url: url })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[employer/settings/account] setMyAvatarUrl", error);
    return { ok: false, error: "Couldn't save your photo." };
  }
  revalidatePath("/employer/settings/account");
  revalidatePath("/employer/team");
  return { ok: true };
}
