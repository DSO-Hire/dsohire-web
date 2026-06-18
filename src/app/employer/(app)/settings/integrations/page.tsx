/**
 * /employer/settings/integrations — Phase 5A Day 2.
 *
 * Lists calendar connections (Google + Outlook) with connect /
 * disconnect controls. Replaces the earlier <ComingSoon> placeholder
 * now that the OAuth + token-refresh foundation is in place.
 *
 * PMS connectors, webhooks, and API tokens are still on the roadmap
 * — they'll appear here as additional cards under the same header
 * when they ship in later phases.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/integrations/connections";
import { CalendarIntegrationsCard } from "@/components/integrations/calendar-integrations-card";

export const metadata: Metadata = { title: "Integrations · Settings" };
export const dynamic = "force-dynamic";

/**
 * Normalize the querystring written by the OAuth callbacks
 * (`?connected=google|microsoft` on success, `?error=<reason>` on
 * failure, `?denied=1` if we ever add explicit cancel handling) into
 * the banner's three-state `integration` prop.
 *
 * Google's consent screen returns ?error=access_denied when the user
 * clicks Cancel; we map that to the friendlier "denied" banner. All
 * other errors fall through to the red "error" banner with the raw
 * reason as the message.
 */
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

export default async function IntegrationsSettingsPage({
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
  if (!user) redirect("/employer/sign-in");

  const [google, microsoft] = await Promise.all([
    getConnection(user.id, "google"),
    getConnection(user.id, "microsoft"),
  ]);

  const params = await searchParams;
  const status = normalizeStatus(params);

  return (
    <div className="max-w-[820px]">
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
        returnTo="/employer/settings/integrations"
        searchParams={status}
      />
    </div>
  );
}
