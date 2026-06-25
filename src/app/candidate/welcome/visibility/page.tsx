/**
 * /candidate/welcome/visibility — the first-run privacy/visibility step
 * (consent-based privacy, Option 3). Standalone (no shell), like track-chooser:
 * it's a gateway every new candidate passes through right after signup, before
 * any other nudge. Backfilled candidates (flipped to private when we moved to
 * private-by-default) also land here the first time they re-enter the shelled
 * app, via the gate in candidate/(app)/layout.tsx.
 *
 * Copy leads with control: "You're private by default. Choose who can find
 * you." The candidate is already 'hidden'; this surfaces the choice prominently
 * rather than leaving it buried in Settings.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VisibilityForm } from "./visibility-form";
import type { VisibilityChoice } from "./actions";

export const metadata: Metadata = {
  title: "Choose who can find you",
};

export default async function WelcomeVisibilityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/welcome/visibility");

  const { data: c } = await supabase
    .from("candidates")
    .select("cv_visibility, anonymous_mode, privacy_choices_reviewed_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!c) redirect("/candidate/sign-up");

  // Already made a deliberate choice → don't force the gateway again. Settings
  // → Privacy is where they change it thereafter.
  if ((c as Record<string, unknown>).privacy_choices_reviewed_at) {
    redirect("/candidate/dashboard");
  }

  // Pre-select the radio from any current value (a backfilled candidate may
  // have had a real prior value; a fresh signup is 'hidden'). Default: private.
  const cv = (c as Record<string, unknown>).cv_visibility as string | null;
  const anon = Boolean((c as Record<string, unknown>).anonymous_mode);
  const initial: VisibilityChoice =
    cv === "hidden" || cv == null
      ? "private"
      : anon
        ? "anonymous"
        : "discoverable";

  return <VisibilityForm initial={initial} />;
}
