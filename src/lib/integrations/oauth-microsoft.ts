/**
 * Microsoft Identity (Entra) OAuth helpers — Graph Calendars.ReadWrite +
 * userinfo.
 *
 * Mirrors `oauth-google.ts` so the calling code stays symmetric:
 *   1. Build the authorization-request URL (redirect to consent)
 *   2. Exchange the auth code for an access + refresh token pair
 *   3. Refresh an expired access token using the stored refresh token
 *   4. Fetch /me for the connected email (mail or userPrincipalName)
 *
 * We use the multi-tenant `common` endpoint so personal + work +
 * school Microsoft accounts can all connect through the same OAuth
 * client app registration. The refresh-token rotation behavior on
 * Microsoft is similar to Google's — sometimes a new refresh token is
 * returned, sometimes not. Always persist when present.
 *
 * Why `offline_access` is in the scopes:
 *   Microsoft only issues a refresh_token when `offline_access` is
 *   explicitly requested in scope. Without it the API returns
 *   access_token-only and we'd have no way to refresh server-side.
 *
 * Env vars (server-only):
 *   MICROSOFT_OAUTH_CLIENT_ID
 *   MICROSOFT_OAUTH_CLIENT_SECRET
 *
 * Redirect URI: `${NEXT_PUBLIC_SITE_URL}/api/integrations/microsoft/callback`
 * Must be registered exactly in the Azure App Registration's redirect
 * URI list under "Web" platform; otherwise consent fails with
 * AADSTS50011.
 */

const MS_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_USERINFO_URL = "https://graph.microsoft.com/v1.0/me";

const MS_SCOPES = [
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "offline_access",
  "openid",
  "email",
  "profile",
  "User.Read",
].join(" ");

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
}

function getMicrosoftRedirectUri(): string {
  return `${getSiteUrl()}/api/integrations/microsoft/callback`;
}

function getMicrosoftClientId(): string {
  const id = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  if (!id) {
    throw new Error(
      "MICROSOFT_OAUTH_CLIENT_ID is not set. Add it to your Vercel env vars (production + preview) or .env.local."
    );
  }
  return id;
}

function getMicrosoftClientSecret(): string {
  const secret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "MICROSOFT_OAUTH_CLIENT_SECRET is not set. Add it to your Vercel env vars (production + preview) or .env.local."
    );
  }
  return secret;
}

export interface MicrosoftTokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  idToken?: string;
}

export interface MicrosoftTokenRefreshResult {
  accessToken: string;
  /** Microsoft rotates refresh tokens; undefined when unchanged. */
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}

export interface MicrosoftUserInfo {
  email: string;
  name?: string;
  id: string;
}

/**
 * Build the initial OAuth consent redirect URL. `prompt=select_account`
 * gives nicer UX for users with multiple Microsoft identities; without
 * it Microsoft silently picks whichever was last used in this browser.
 */
export function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getMicrosoftClientId(),
    redirect_uri: getMicrosoftRedirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: MS_SCOPES,
    prompt: "select_account",
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens. Microsoft returns an
 * `error_description` field on failure which we surface verbatim — it
 * carries the AADSTS code that's invaluable when debugging.
 */
export async function exchangeMicrosoftCode(
  code: string
): Promise<MicrosoftTokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: getMicrosoftClientId(),
    client_secret: getMicrosoftClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: getMicrosoftRedirectUri(),
    scope: MS_SCOPES,
  });

  let response: Response;
  try {
    response = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Microsoft token exchange network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message =
      raw && typeof raw === "object" && "error_description" in raw
        ? String((raw as { error_description: unknown }).error_description)
        : `Microsoft token exchange failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const data = raw as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    id_token?: unknown;
  };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Microsoft token response missing access_token.");
  }
  if (typeof data.refresh_token !== "string" || data.refresh_token.length === 0) {
    throw new Error(
      "Microsoft token response missing refresh_token. Ensure `offline_access` is in the requested scopes."
    );
  }
  if (typeof data.expires_in !== "number") {
    throw new Error("Microsoft token response missing expires_in.");
  }

  const scopes =
    typeof data.scope === "string" && data.scope.length > 0
      ? data.scope.split(/\s+/)
      : [];
  const idToken =
    typeof data.id_token === "string" ? data.id_token : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scopes,
    idToken,
  };
}

/**
 * Refresh an access token. Microsoft typically returns a rotated
 * refresh_token; when present the caller must persist it (the old one
 * will eventually stop working).
 */
export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<MicrosoftTokenRefreshResult> {
  const body = new URLSearchParams({
    client_id: getMicrosoftClientId(),
    client_secret: getMicrosoftClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MS_SCOPES,
  });

  let response: Response;
  try {
    response = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Microsoft token refresh network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message =
      raw && typeof raw === "object" && "error_description" in raw
        ? String((raw as { error_description: unknown }).error_description)
        : `Microsoft token refresh failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const data = raw as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Microsoft refresh response missing access_token.");
  }
  if (typeof data.expires_in !== "number") {
    throw new Error("Microsoft refresh response missing expires_in.");
  }

  const scopes =
    typeof data.scope === "string" && data.scope.length > 0
      ? data.scope.split(/\s+/)
      : [];
  const rotatedRefresh =
    typeof data.refresh_token === "string" && data.refresh_token.length > 0
      ? data.refresh_token
      : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: rotatedRefresh,
    expiresIn: data.expires_in,
    scopes,
  };
}

/**
 * Fetch the /me profile. `mail` is the primary SMTP address (null for
 * consumer Microsoft accounts that haven't set one), `userPrincipalName`
 * is the sign-in identifier — for work accounts they match, for
 * consumer accounts UPN looks like alice_outlook.com#EXT#@... so prefer
 * `mail` when non-null.
 */
export async function fetchMicrosoftUserInfo(
  accessToken: string
): Promise<MicrosoftUserInfo> {
  let response: Response;
  try {
    response = await fetch(MS_USERINFO_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Microsoft userinfo network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    throw new Error(`Microsoft userinfo failed (HTTP ${response.status}).`);
  }

  const data = raw as {
    mail?: unknown;
    userPrincipalName?: unknown;
    displayName?: unknown;
    id?: unknown;
  };

  const email =
    typeof data.mail === "string" && data.mail.length > 0
      ? data.mail
      : typeof data.userPrincipalName === "string" &&
          data.userPrincipalName.length > 0
        ? data.userPrincipalName
        : null;

  if (!email) {
    throw new Error(
      "Microsoft userinfo response missing both mail and userPrincipalName."
    );
  }
  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new Error("Microsoft userinfo response missing id.");
  }

  return {
    email,
    name: typeof data.displayName === "string" ? data.displayName : undefined,
    id: data.id,
  };
}
