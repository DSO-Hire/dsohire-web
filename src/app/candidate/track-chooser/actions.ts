"use server";

/**
 * Track chooser save (#53). Persists the candidate's chosen fit track
 * (primary_fit_product) and returns the assessment they should land on. The
 * choice drives the sidebar product + assessment routing; changeable later in
 * Settings. Required at signup so we never have to GUESS practice vs DSO.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Track = "practicefit" | "dsofit";

interface Result {
  ok: boolean;
  dest?: string;
  error?: string;
}

export async function saveTrackChoice(product: Track): Promise<Result> {
  if (product !== "practicefit" && product !== "dsofit") {
    return { ok: false, error: "Pick a track." };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "No candidate profile." };

  const { error } = await supabase
    .from("candidates")
    .update({ primary_fit_product: product })
    .eq("id", (candidate as { id: string }).id);
  if (error) {
    console.error("[track-chooser] save failed", error);
    return { ok: false, error: "Couldn't save — try again." };
  }

  return {
    ok: true,
    dest:
      product === "dsofit"
        ? "/candidate/dsofit-assessment"
        : "/candidate/assessment",
  };
}
