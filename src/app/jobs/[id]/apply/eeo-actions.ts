"use server";

/**
 * E2.17 — Voluntary EEO / demographic self-identification.
 *
 * Persists a candidate's optional self-ID for ONE application into the
 * segregated `application_eeo_responses` table (one row per application,
 * upserted on re-submit). This data is firewalled from employers by RLS
 * (no DSO policy exists on the table) and is never joined into any
 * non-EEO query path.
 *
 * Voluntary always: every field may be left blank, and the apply flow
 * never blocks on this step.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidEeoValue, type EeoFieldKey } from "@/lib/eeo/options";

export interface EeoState {
  ok: boolean;
  error?: string;
}

export interface EeoSelfIdInput {
  applicationId: string;
  gender?: string | null;
  race_ethnicity?: string | null;
  veteran_status?: string | null;
  disability_status?: string | null;
}

const FIELD_KEYS: EeoFieldKey[] = [
  "gender",
  "race_ethnicity",
  "veteran_status",
  "disability_status",
];

export async function submitEeoSelfId(
  input: EeoSelfIdInput
): Promise<EeoState> {
  const applicationId = String(input.applicationId ?? "").trim();
  if (!applicationId) {
    return { ok: false, error: "Missing application reference." };
  }

  // Normalize + validate every field against the canonical option sets.
  // Empty string → null (left blank). Unknown slugs are rejected here so
  // a malformed post can't violate the table CHECK and surface a 500.
  const normalized: Record<EeoFieldKey, string | null> = {
    gender: null,
    race_ethnicity: null,
    veteran_status: null,
    disability_status: null,
  };
  for (const key of FIELD_KEYS) {
    const raw = (input[key] ?? null) as string | null;
    const value = raw && raw.trim() ? raw.trim() : null;
    if (!isValidEeoValue(key, value)) {
      return { ok: false, error: "That selection isn't recognized." };
    }
    normalized[key] = value;
  }

  const supabase = await createSupabaseServerClient();

  // Must be a signed-in candidate.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  // Defense-in-depth ownership check (RLS also enforces this). Resolve the
  // current user's candidate row, then confirm the application is theirs.
  // Two simple single-table hops — avoids embed/array shape surprises.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return { ok: false, error: "We couldn't verify your application." };
  }

  const { data: owned } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();
  if (!owned) {
    return { ok: false, error: "We couldn't verify your application." };
  }

  const { error: upsertError } = await supabase
    .from("application_eeo_responses")
    .upsert(
      {
        application_id: applicationId,
        gender: normalized.gender,
        race_ethnicity: normalized.race_ethnicity,
        veteran_status: normalized.veteran_status,
        disability_status: normalized.disability_status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "application_id" }
    );

  if (upsertError) {
    console.error("[eeo] upsert failed:", upsertError);
    return {
      ok: false,
      error: "We couldn't save your response. Please try again.",
    };
  }

  return { ok: true };
}
