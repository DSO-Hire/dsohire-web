/**
 * Calendar-connections persistence + token lifecycle.
 *
 * One module per calendar_connections concern:
 *   - getConnection         — service-role lookup (UI status, callers)
 *   - upsertConnection      — service-role upsert keyed on (user, provider)
 *   - deleteConnection      — best-effort provider revoke + row delete
 *   - getValidAccessToken   — returns a non-expired access token, refreshing
 *                             and persisting in place when within 60 s of
 *                             expiry. Returns null when no connection exists.
 *
 * All writes go through the service-role client because the row-level
 * security policy on calendar_connections is service-role-only for
 * INSERT/UPDATE/DELETE — column-level grants further block token columns
 * from leaking via SELECT to authenticated clients.
 *
 * Token-refresh semantics:
 *   We refresh proactively (60-second slack) rather than reactively
 *   (catching 401s) because every retry adds round-trip latency to the
 *   interview-push flow. The slack covers cases where the JWT is
 *   minted right before the API call but the actual provider hop takes
 *   slightly longer than expected.
 *
 *   When a refresh returns a rotated refresh_token, we persist it. When
 *   it returns no refresh_token (Google sometimes; Microsoft rarely),
 *   we keep the previously-stored one — it remains valid.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  refreshGoogleToken,
  revokeGoogleToken,
} from "@/lib/integrations/oauth-google";
import { refreshMicrosoftToken } from "@/lib/integrations/oauth-microsoft";

export type CalendarProvider = "google" | "microsoft";

export interface ConnectionRow {
  id: string;
  auth_user_id: string;
  provider: CalendarProvider;
  connected_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  provider_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UpsertConnectionInput {
  authUserId: string;
  provider: CalendarProvider;
  connectedEmail: string;
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry timestamp (UTC). */
  expiresAt: Date;
  scopes: string[];
  providerMetadata?: Record<string, unknown>;
}

/**
 * Read a single connection. Returns null when there's no row OR when
 * the underlying query errors — in both cases the caller should treat
 * the connection as absent and prompt re-connect. Errors are logged
 * for triage; this never throws.
 */
export async function getConnection(
  authUserId: string,
  provider: CalendarProvider
): Promise<ConnectionRow | null> {
  if (!authUserId) return null;
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .select(
      "id, auth_user_id, provider, connected_email, access_token, refresh_token, expires_at, scopes, provider_metadata, created_at, updated_at"
    )
    .eq("auth_user_id", authUserId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    console.warn("[integrations] getConnection failed", {
      authUserId,
      provider,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return data as unknown as ConnectionRow;
}

/**
 * Upsert a connection row. Keyed on the (auth_user_id, provider) unique
 * constraint, so a re-connect rotates tokens in place rather than
 * creating duplicate rows.
 */
export async function upsertConnection(
  input: UpsertConnectionInput
): Promise<void> {
  if (!input.authUserId || !input.provider) {
    throw new Error("upsertConnection: authUserId and provider are required.");
  }
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("calendar_connections").upsert(
    {
      auth_user_id: input.authUserId,
      provider: input.provider,
      connected_email: input.connectedEmail,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      expires_at: input.expiresAt.toISOString(),
      scopes: input.scopes,
      provider_metadata: input.providerMetadata ?? {},
    },
    { onConflict: "auth_user_id,provider" }
  );
  if (error) {
    throw new Error(`upsertConnection failed: ${error.message}`);
  }
}

/**
 * Revoke at the provider (best-effort, swallow failures) and delete
 * our row. We do provider-side revoke first so that a failure to
 * delete locally still leaves the user able to recover by reconnecting
 * fresh.
 */
export async function deleteConnection(
  authUserId: string,
  provider: CalendarProvider
): Promise<void> {
  if (!authUserId || !provider) {
    throw new Error("deleteConnection: authUserId and provider are required.");
  }
  const existing = await getConnection(authUserId, provider);
  if (!existing) return;

  if (provider === "google") {
    // Revoking the refresh token invalidates the whole grant including
    // the access token. Logged but never thrown.
    const ok = await revokeGoogleToken(existing.refresh_token);
    if (!ok) {
      console.warn("[integrations] Google revoke returned non-OK", {
        authUserId,
      });
    }
  } else {
    // Microsoft v2 has no programmatic revoke endpoint — the user must
    // remove the consent from https://myaccount.microsoft.com/. We log
    // and proceed to clear our row; tokens become useless once we stop
    // refreshing them.
    console.warn(
      "[integrations] Microsoft v2 has no revoke endpoint; user must revoke at myaccount.microsoft.com"
    );
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("calendar_connections")
    .delete()
    .eq("auth_user_id", authUserId)
    .eq("provider", provider);
  if (error) {
    throw new Error(`deleteConnection failed: ${error.message}`);
  }
}

const EXPIRY_SLACK_MS = 60 * 1000;

/**
 * Return a non-expired access token for (user, provider), refreshing
 * and persisting in place when expiry is within 60 s. Returns null when
 * no connection exists OR when a refresh attempt fails (so callers
 * gracefully degrade to "not connected" rather than throwing through
 * the interview-booking flow).
 */
export async function getValidAccessToken(
  authUserId: string,
  provider: CalendarProvider
): Promise<string | null> {
  const conn = await getConnection(authUserId, provider);
  if (!conn) return null;

  const expiresAtMs = new Date(conn.expires_at).getTime();
  const nowMs = Date.now();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - nowMs > EXPIRY_SLACK_MS) {
    return conn.access_token;
  }

  try {
    if (provider === "google") {
      const refreshed = await refreshGoogleToken(conn.refresh_token);
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await upsertConnection({
        authUserId: conn.auth_user_id,
        provider: "google",
        connectedEmail: conn.connected_email,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? conn.refresh_token,
        expiresAt: newExpiresAt,
        scopes: refreshed.scopes.length > 0 ? refreshed.scopes : conn.scopes,
        providerMetadata: conn.provider_metadata,
      });
      return refreshed.accessToken;
    }

    const refreshed = await refreshMicrosoftToken(conn.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
    await upsertConnection({
      authUserId: conn.auth_user_id,
      provider: "microsoft",
      connectedEmail: conn.connected_email,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? conn.refresh_token,
      expiresAt: newExpiresAt,
      scopes: refreshed.scopes.length > 0 ? refreshed.scopes : conn.scopes,
      providerMetadata: conn.provider_metadata,
    });
    return refreshed.accessToken;
  } catch (err) {
    console.warn("[integrations] token refresh failed", {
      authUserId,
      provider,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
