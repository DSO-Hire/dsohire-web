/**
 * /api/integrations/microsoft/callback — Microsoft OAuth landing.
 *
 * Mirrors the Google callback route — state-cookie verification,
 * single-use cookie clearing, code-for-token exchange, Graph /me
 * lookup, and connections upsert. See the Google callback file for the
 * full step-by-step narrative.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  exchangeMicrosoftCode,
  fetchMicrosoftUserInfo,
} from "@/lib/integrations/oauth-microsoft";
import { upsertConnection } from "@/lib/integrations/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "oauth_state_microsoft";
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
    tokens = await exchangeMicrosoftCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange_failed";
    return redirectWithError(message);
  }

  let userInfo;
  try {
    userInfo = await fetchMicrosoftUserInfo(tokens.accessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "userinfo_failed";
    return redirectWithError(message);
  }

  try {
    await upsertConnection({
      authUserId: user.id,
      provider: "microsoft",
      connectedEmail: userInfo.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scopes: tokens.scopes,
      providerMetadata: {
        id: userInfo.id,
        name: userInfo.name ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "persist_failed";
    return redirectWithError(message);
  }

  const nextPath = parsed.next || FALLBACK_NEXT;
  const successUrl = new URL(nextPath, SITE_URL);
  successUrl.searchParams.set("connected", "microsoft");
  return NextResponse.redirect(successUrl);
}
