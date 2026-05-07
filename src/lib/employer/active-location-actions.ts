"use server";

/**
 * Server action: set the active-location cookie (Phase 4.6.d).
 *
 * Validates the location belongs to the current user's DSO before
 * writing. Pass "all" (or an empty string) to clear and view everything.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_LOCATION_COOKIE } from "./active-location";

export async function setActiveLocation(input: {
  locationId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const store = await cookies();

  // "All" / clear path.
  if (!input.locationId || input.locationId === "all") {
    store.set(ACTIVE_LOCATION_COOKIE, "all", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year — session-feeling, persists across logins
    });
    revalidatePath("/employer", "layout");
    return { ok: true };
  }

  // Validate the location belongs to the user's DSO. RLS would refuse
  // a select on someone else's location, so this is enforced naturally.
  const { data: location } = await supabase
    .from("dso_locations")
    .select("id")
    .eq("id", input.locationId)
    .maybeSingle();

  if (!location) {
    return { ok: false, error: "Location not found." };
  }

  store.set(ACTIVE_LOCATION_COOKIE, input.locationId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/employer", "layout");
  return { ok: true };
}
