/**
 * /api/integrations/google/callback — Google OAuth landing.
 *
 * Flow:
 *   1. Parse `code` + `state` (and optional `error`) from the query.
 *   2. Compare `state` against the value we stored in the httpOnly
 *      cookie at `/connect` time. Bail with 400 on mismatch (CSRF).
 *   3. Clear the state cookie so a replay is impossible.
 *   4. Verify the user is still signed in (their auth session must not
 *      have expired during the consent flow).
 *   5. Exchange the code for tokens, then fetch userinfo for the
 *      connected email.
 *   6. Upsert the calendar_connections row (service-role).
 *   7. Redirect back to the `next` path captured in the state cookie,
 *      with `?connected=google` for the UI to show a success toast.
 *
 * Operational failures (state mismatch, code expired, scope denied)
 * redirect to the integrations settings page with `?error=...` so the
 * UI can render the message.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
} from "@/lib/integrations/oauth-google";
import { upsertConnection } from "@/lib/integrations/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "oauth_state_google";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const FALLBACK_NEXT = "/employer/settings/integrations";

interface StateCookiePayload {
  state: string;
  next: string;
}

function parseStateCookie(value: string | undefined): StateCookiePayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "state" in parsed &&
      "next" in parsed &&
      typeof (parsed as { state: unknown }).state === "string" &&
      typeof (parsed as { next: unknown }).next === "string"
    ) {
      return parsed as StateCookiePayload;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function redirectWithError(reason: string): NextResponse {
  const url = new URL(FALLBACK_NEXT, SITE_URL);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const parsed = parseStateCookie(stateCookie);

  // Always clear the state cookie — we use it exactly once.
  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  if (oauthError) {
    const reason = oauthErrorDescription ?? oauthError;
    return redirectWithError(reason);
  }
  if (!code || !stateFromQuery) {
    return redirectWithError("missing_code_or_state");
  }
  if (!parsed || parsed.state !== stateFromQuery) {
    return NextResponse.json(
      { error: "state mismatch" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithError("not_signed_in");
  }

  let tokens;
  try {
    tokens = await exchangeGoogleCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange_failed";
    return redirectWithError(message);
  }

  let userInfo;
  try {
    userInfo = await fetchGoogleUserInfo(tokens.accessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "userinfo_failed";
    return redirectWithError(message);
  }

  try {
    await upsertConnection({
      authUserId: user.id,
      provider: "google",
      connectedEmail: userInfo.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scopes: tokens.scopes,
      providerMetadata: {
        sub: userInfo.sub,
        name: userInfo.name ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "persist_failed";
    return redirectWithError(message);
  }

  const nextPath = parsed.next || FALLBACK_NEXT;
  const successUrl = new URL(nextPath, SITE_URL);
  successUrl.searchParams.set("connected", "google");
  return NextResponse.redirect(successUrl);
}
