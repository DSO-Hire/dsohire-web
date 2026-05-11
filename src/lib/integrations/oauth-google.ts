/**
 * Google OAuth helpers — calendar.events.owned + userinfo.
 *
 * Wraps the three HTTP calls every Google OAuth integration needs:
 *   1. Build the authorization-request URL (redirect to consent)
 *   2. Exchange the auth code for an access + refresh token pair
 *   3. Refresh an expired access token using the stored refresh token
 *
 * Plus a small `fetchGoogleUserInfo` helper that returns the email +
 * name + sub claim from the OpenID Connect userinfo endpoint — we use
 * the email as the displayable "Connected as ..." string in the
 * integrations UI and persist it on the calendar_connections row.
 *
 * Why `access_type=offline` + `prompt=consent`:
 *   Google only issues a refresh_token on the FIRST consent for a given
 *   (client_id, user, scopes) tuple. If the user revoked us once and
 *   comes back, a vanilla request returns access_token-only and we'd
 *   have no way to refresh server-side. `prompt=consent` forces the
 *   consent screen every time, which forces refresh_token re-issuance.
 *
 * Env vars (server-only):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Redirect URI: `${NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`
 * Must be registered exactly (scheme + host + path) in the Google Cloud
 * Console OAuth client config; otherwise the consent step fails with
 * "redirect_uri_mismatch".
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "openid",
  "email",
  "profile",
].join(" ");

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
}

function getGoogleRedirectUri(): string {
  return `${getSiteUrl()}/api/integrations/google/callback`;
}

function getGoogleClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID is not set. Add it to your Vercel env vars (production + preview) or .env.local."
    );
  }
  return id;
}

function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_SECRET is not set. Add it to your Vercel env vars (production + preview) or .env.local."
    );
  }
  return secret;
}

export interface GoogleTokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  idToken?: string;
}

export interface GoogleTokenRefreshResult {
  accessToken: string;
  /** Google sometimes rotates the refresh token; undefined when unchanged. */
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}

export interface GoogleUserInfo {
  email: string;
  name?: string;
  sub: string;
}

/**
 * Build the initial OAuth consent redirect URL.
 *
 * The caller is responsible for generating `state` (32 bytes hex is
 * conventional), storing it server-side (httpOnly cookie), and verifying
 * it on the callback to defeat CSRF. We don't generate state here so
 * that the caller can pack additional context (e.g. a `next` redirect)
 * into the cookie payload alongside it.
 */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens. Throws on programmer
 * errors (missing env, network failure) — operational failures (invalid
 * code, expired code) are surfaced as thrown errors with the Google
 * `error_description` so the caller can render a friendly message.
 */
export async function exchangeGoogleCode(
  code: string
): Promise<GoogleTokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: getGoogleRedirectUri(),
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Google token exchange network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message =
      raw && typeof raw === "object" && "error_description" in raw
        ? String((raw as { error_description: unknown }).error_description)
        : `Google token exchange failed (HTTP ${response.status}).`;
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
    throw new Error("Google token response missing access_token.");
  }
  if (typeof data.refresh_token !== "string" || data.refresh_token.length === 0) {
    // This is the classic "user revoked us and reconnected without
    // prompt=consent" failure mode. We force prompt=consent on the
    // auth URL, so reaching this branch indicates a misconfiguration.
    throw new Error(
      "Google token response missing refresh_token. Ensure prompt=consent + access_type=offline were sent on the auth request."
    );
  }
  if (typeof data.expires_in !== "number") {
    throw new Error("Google token response missing expires_in.");
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
 * Refresh an access token using a stored refresh token. Google MAY
 * return a new refresh_token (token rotation); when present the caller
 * must persist it. When absent, keep using the previously-stored one.
 */
export async function refreshGoogleToken(
  refreshToken: string
): Promise<GoogleTokenRefreshResult> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Google token refresh network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message =
      raw && typeof raw === "object" && "error_description" in raw
        ? String((raw as { error_description: unknown }).error_description)
        : `Google token refresh failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const data = raw as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Google refresh response missing access_token.");
  }
  if (typeof data.expires_in !== "number") {
    throw new Error("Google refresh response missing expires_in.");
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
 * Fetch the OIDC userinfo claims. Used to capture the email the user
 * connected with — Google's userinfo email is verified, so we trust it
 * for display.
 */
export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_USERINFO_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Google userinfo network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    throw new Error(`Google userinfo failed (HTTP ${response.status}).`);
  }

  const data = raw as {
    email?: unknown;
    name?: unknown;
    sub?: unknown;
  };

  if (typeof data.email !== "string" || data.email.length === 0) {
    throw new Error("Google userinfo response missing email.");
  }
  if (typeof data.sub !== "string" || data.sub.length === 0) {
    throw new Error("Google userinfo response missing sub.");
  }

  return {
    email: data.email,
    name: typeof data.name === "string" ? data.name : undefined,
    sub: data.sub,
  };
}

/**
 * Best-effort revocation. Google honors revocation on both access and
 * refresh tokens — passing the refresh token revokes the entire grant.
 * Failures are reported via the boolean return so callers can log
 * without aborting their own cleanup path.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
