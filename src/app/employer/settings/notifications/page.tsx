/**
 * /employer/settings/notifications — Phase 4.5.c.
 *
 * Server component fetches the current user's existing
 * `notification_preferences` rows + composes them with
 * EMPLOYER_NOTIFICATION_DEFAULTS so the form starts with sensible
 * values for events the user hasn't toggled yet.
 *
 * The form (`./notifications-form.tsx`) is purely client-side state +
 * one save action. The dispatcher (`src/lib/notifications/dispatcher.ts`)
 * already reads from the same table — no other plumbing needed.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EMPLOYER_NOTIFICATION_EVENTS,
  EMPLOYER_NOTIFICATION_DEFAULTS,
} from "@/lib/notifications/employer-events";
import { EmployerNotificationsForm } from "./notifications-form";

export const metadata: Metadata = { title: "Notifications · Settings" };

export default async function EmployerNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in?next=/employer/settings/notifications");

  // Pull every existing preference row for this user. A row exists only
  // when the user has explicitly toggled something — otherwise the form
  // falls back to EMPLOYER_NOTIFICATION_DEFAULTS.
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
  for (const event of EMPLOYER_NOTIFICATION_EVENTS) {
    initial[event.event_kind] = {};
    for (const channel of event.channels) {
      const override = existing[event.event_kind]?.[channel];
      const defaultValue =
        EMPLOYER_NOTIFICATION_DEFAULTS[event.event_kind]?.[channel] ?? true;
      initial[event.event_kind][channel] =
        override !== undefined ? override : defaultValue;
    }
  }

  return (
    <div>
      <header className="mb-6 max-w-[680px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Notifications
        </div>
        <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink">
          How DSO Hire reaches you
        </h2>
        <p className="mt-2 text-[14px] text-slate-body leading-relaxed">
          Toggle email and in-app notifications per event. SMS rolls out in
          a follow-up release. Your preferences here are the source of
          truth — the dispatcher never overrides them, with the single
          exception of transactional events (team invitations) marked
          Required below.
        </p>
      </header>
      <EmployerNotificationsForm initial={initial} />
    </div>
  );
}
