"use server";

/**
 * First-run visibility choice (consent-based privacy, Option 3).
 *
 * A new candidate is private by default (cv_visibility='hidden'). This action
 * persists their DELIBERATE choice of who can find them, stamps
 * privacy_choices_reviewed_at (the honest "they made a choice" signal the
 * dashboard onboarding checklist + the (app) gate both read), and returns where
 * to send them next:
 *   - no track chosen yet  → /candidate/track-chooser (fresh signup flow)
 *   - track already chosen → /candidate/dashboard (e.g. a backfilled candidate
 *                            re-opting-in after the private-by-default flip)
 *
 * The three choices map to (cv_visibility, anonymous_mode):
 *   - "private"           → ('hidden',          false)  — stay private
 *   - "discoverable"      → ('recruiters_only', false)  — findable, with name
 *   - "anonymous"         → ('recruiters_only', true)   — findable, masked
 *
 * Contact + résumé visibility stay 'after_apply' regardless (we don't touch
 * them here). Demographic/EEO answers are never exposed to anyone.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapVisibilityChoice,
  type VisibilityChoice,
} from "@/lib/candidate/visibility-choice";

export type { VisibilityChoice };

interface Result {
  ok: boolean;
  dest?: string;
  error?: string;
}

export async function saveVisibilityChoice(
  choice: VisibilityChoice
): Promise<Result> {
  const mapped = mapVisibilityChoice(choice);
  if (!mapped) return { ok: false, error: "Pick an option." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, primary_fit_product")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "No candidate profile." };

  const { error } = await supabase
    .from("candidates")
    .update({
      cv_visibility: mapped.cv_visibility,
      anonymous_mode: mapped.anonymous_mode,
      // The deliberate choice has now been made — stamp it. This is what lets
      // the candidate past the (app) first-run gate and completes the
      // onboarding visibility/matching checklist items honestly.
      privacy_choices_reviewed_at: new Date().toISOString(),
    })
    .eq("id", (candidate as { id: string }).id);

  if (error) {
    console.error("[welcome/visibility] save failed", error);
    return { ok: false, error: "Couldn't save — try again." };
  }

  const hasTrack = Boolean(
    (candidate as Record<string, unknown>).primary_fit_product
  );
  return {
    ok: true,
    dest: hasTrack ? "/candidate/dashboard" : "/candidate/track-chooser",
  };
}
