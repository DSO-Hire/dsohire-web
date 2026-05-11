"use server";

/**
 * Calendar-connection server actions (Phase 5A Day 2).
 *
 * Currently exposes a single action — `disconnectCalendarProvider` —
 * for the integrations settings surface (employer + candidate). The
 * connect side lives at /api/integrations/{provider}/connect because
 * it has to be an HTTP redirect, not a server action.
 *
 * Auth: must be a signed-in user. The action operates on the caller's
 * own auth.users.id only; there's no admin-disconnect-someone-else
 * path. `deleteConnection` (in ./connections.ts) handles provider-
 * side revoke (Google) or logs a notice (Microsoft, which has no
 * v2 revoke endpoint) before deleting the row.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteConnection } from "@/lib/integrations/connections";

export interface DisconnectResult {
  ok: boolean;
  error?: string;
}

export async function disconnectCalendarProvider(
  provider: "google" | "microsoft"
): Promise<DisconnectResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    await deleteConnection(user.id, provider);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  revalidatePath("/employer/settings/integrations");
  revalidatePath("/candidate/settings/integrations");
  return { ok: true };
}
