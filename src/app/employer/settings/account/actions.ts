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
