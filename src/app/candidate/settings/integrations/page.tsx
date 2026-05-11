/**
 * /candidate/settings/integrations — Phase 5A Day 2 candidate side.
 *
 * Mirrors the employer page — same shared <CalendarIntegrationsCard>
 * component — but loads the candidate user's connections and points
 * the OAuth round-trip back to the candidate route.
 *
 * Candidates connect a calendar so accepted interview times auto-
 * create events on their personal calendar with the video link
 * embedded. They never lose track of an interview because we own
 * delivery on both ends.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/integrations/connections";
import { CalendarIntegrationsCard } from "@/components/integrations/calendar-integrations-card";

export const metadata: Metadata = { title: "Integrations · Settings" };
export const dynamic = "force-dynamic";

function normalizeStatus(params: {
  connected?: string;
  error?: string;
  denied?: string;
}): { integration?: "connected" | "denied" | "error"; message?: string } {
  if (params.connected === "google" || params.connected === "microsoft") {
    return { integration: "connected" };
  }
  if (params.denied) {
    return { integration: "denied" };
  }
  if (params.error) {
    if (params.error === "access_denied" || params.error === "user_cancelled") {
      return { integration: "denied" };
    }
    return { integration: "error", message: params.error };
  }
  return {};
}

export default async function CandidateIntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    error?: string;
    denied?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/integrations");

  const [google, microsoft] = await Promise.all([
    getConnection(user.id, "google"),
    getConnection(user.id, "microsoft"),
  ]);

  const params = await searchParams;
  const status = normalizeStatus(params);

  return (
    <div>
      <CalendarIntegrationsCard
        google={{
          connected: !!google,
          connectedEmail: google?.connected_email,
          expiresAt: google?.expires_at,
        }}
        microsoft={{
          connected: !!microsoft,
          connectedEmail: microsoft?.connected_email,
          expiresAt: microsoft?.expires_at,
        }}
        returnTo="/candidate/settings/integrations"
        searchParams={status}
      />
    </div>
  );
}
