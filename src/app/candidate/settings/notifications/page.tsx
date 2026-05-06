/**
 * /candidate/settings/notifications — Phase 4.3.b.
 *
 * Server component fetches the candidate's existing
 * `notification_preferences` rows + composes them with defaults
 * (CANDIDATE_NOTIFICATION_DEFAULTS) so the form starts with sensible
 * values for events the candidate hasn't toggled yet.
 *
 * The form (`./notifications-form.tsx`) is purely client-side state +
 * one save action. The dispatcher (`src/lib/notifications/dispatcher.ts`)
 * already reads from this same table — no other plumbing needed.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CANDIDATE_NOTIFICATION_EVENTS,
  CANDIDATE_NOTIFICATION_DEFAULTS,
} from "@/lib/notifications/candidate-events";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = { title: "Notifications · Settings" };

export default async function CandidateNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/notifications");

  // Pull every existing preference row for this user. A row exists only
  // when the candidate has explicitly toggled something — most rows
  // come from defaults below.
  const { data: existingRows } = await supabase
    .from("notification_preferences")
    .select("event_kind, channel, enabled")
    .eq("user_id", user.id);

  const existing: Record<string, Record<string, boolean>> = {};
  for (const row of existingRows ?? []) {
    const kind = row.event_kind as string;
    const channel = row.channel as string;
    const enabled = Boolean(row.enabled);
    existing[kind] = { ...(existing[kind] ?? {}), [channel]: enabled };
  }

  // Compose defaults with overrides for the form's initial state.
  const initial: Record<string, Record<string, boolean>> = {};
  for (const event of CANDIDATE_NOTIFICATION_EVENTS) {
    initial[event.event_kind] = {};
    for (const channel of event.channels) {
      const override = existing[event.event_kind]?.[channel];
      const defaultValue =
        CANDIDATE_NOTIFICATION_DEFAULTS[event.event_kind]?.[channel] ?? true;
      initial[event.event_kind][channel] =
        override !== undefined ? override : defaultValue;
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h2 className="font-display text-xl font-bold text-[#14233F]">
          How we contact you
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Toggle email + in-app notifications per event. SMS rolls out in a
          follow-up release. Your preferences here are the source of truth —
          we never override them.
        </p>
      </header>
      <NotificationsForm initial={initial} />
    </div>
  );
}
