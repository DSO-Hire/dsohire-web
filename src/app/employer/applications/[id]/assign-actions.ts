"use server";

/**
 * assignApplication — set or clear the teammate an application is assigned to.
 * Used by the manual AssigneePicker on the detail page (the automation engine
 * sets the same column via its own service-role path). RLS ("Applications:
 * DSO update") gates this to owner/admin/recruiter on the job's DSO, so a
 * denied write returns zero rows — we treat that as a failure.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function assignApplication(
  applicationId: string,
  dsoUserId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!applicationId) return { ok: false, error: "Missing application." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("applications")
    .update({ assigned_to_dso_user_id: dsoUserId })
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "Couldn't update the assignment." };
  }

  revalidatePath(`/employer/applications/${applicationId}`);
  revalidatePath(`/employer/applications`);
  return { ok: true };
}
