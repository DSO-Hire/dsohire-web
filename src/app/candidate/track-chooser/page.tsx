/**
 * /candidate/track-chooser (#53) — the required, one-tap "which side of dental
 * are you?" screen new candidates hit right after signup. Two-tone split:
 * navy PracticeFit (practice-level) vs heritage DSOFit (DSO/corporate). The
 * choice routes them into the matching assessment and owns their sidebar
 * thereafter (changeable in Settings). Standalone (no shell) — it's a gateway.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrackChooser } from "./track-chooser";

export const metadata: Metadata = { title: "Which side of dental are you?" };

export default async function TrackChooserPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const { change } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/track-chooser");

  const { data: c } = await supabase
    .from("candidates")
    .select("primary_fit_product")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!c) redirect("/candidate/sign-up");

  // Already chose a track → don't force the gateway again, UNLESS they came
  // here deliberately to switch (?change=1, e.g. from a fit hub / Settings).
  if (!change && (c as Record<string, unknown>).primary_fit_product) {
    redirect("/candidate/dashboard");
  }

  return <TrackChooser />;
}
