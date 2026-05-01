"use server";

/**
 * /employer/onboarding server action — adds the first DSO location.
 *
 * RLS allows owner/admin DSO users to insert dso_locations rows for their
 * own DSO, so this action runs as the signed-in user (no service-role needed).
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OnboardingState {
  ok: boolean;
  error?: string;
}

export async function addFirstLocation(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const addressLine1 = String(formData.get("address_line1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "")
    .trim()
    .toUpperCase();
  const postalCode = String(formData.get("postal_code") ?? "").trim();

  if (!dsoId) return { ok: false, error: "Missing DSO context. Refresh and try again." };
  if (!name) return { ok: false, error: "Please enter a name for this location." };
  if (!city) return { ok: false, error: "Please enter the city." };
  if (!state || state.length !== 2) {
    return { ok: false, error: "Please enter a 2-letter US state code (e.g., KS)." };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("dso_locations").insert({
    dso_id: dsoId,
    name,
    address_line1: addressLine1 || null,
    city,
    state,
    postal_code: postalCode || null,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message ??
        "Failed to save location. Refresh and try again, or email cam@dsohire.com.",
    };
  }

  // Activate the DSO once they've added their first location — this is the
  // minimum bar to start posting jobs. Cameron may still manually verify before
  // they go fully live, but we'll move them out of pending state here.
  await supabase.from("dsos").update({ status: "active" }).eq("id", dsoId);

  redirect("/employer/dashboard");
}
