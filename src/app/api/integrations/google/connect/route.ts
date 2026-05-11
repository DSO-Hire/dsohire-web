/**
 * /api/integrations/google/connect — initiate Google Calendar OAuth.
 *
 * Flow:
 *   1. Verify the user is signed in (otherwise bounce to sign-in).
 *   2. Generate a 32-byte random `state` token for CSRF protection.
 *   3. Pack `{ state, next }` into a httpOnly secure cookie (10-min TTL)
 *      so the callback can verify the state AND know where to send the
 *      user after a successful connect.
 *   4. Redirect to the Google consent URL with `state` in the query.
 *
 * The optional `?next=/path` query param lets us bounce the user back
 * to wherever they clicked "Connect Google" from (interview-propose
 * flyout, settings page, etc.). We only honor same-origin paths.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildGoogleAuthUrl } from "@/lib/integrations/oauth-google";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "oauth_state_google";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const FALLBACK_NEXT = "/employer/settings/integrations";

function sanitizeNext(next: string | null): string {
  if (!next) return FALLBACK_NEXT;
  // Same-origin only — must start with a single forward slash and not
  // be a protocol-relative URL (//evil.com/...).
  if (!next.startsWith("/") || next.startsWith("//")) return FALLBACK_NEXT;
  return next;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/employer/sign-in", SITE_URL);
    signInUrl.searchParams.set("next", "/employer/settings/integrations");
    return NextResponse.redirect(signInUrl);
  }

  const url = new URL(request.url);
  const next = sanitizeNext(url.searchParams.get("next"));

  const state = randomBytes(32).toString("hex");
  const payload = JSON.stringify({ state, next });

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  const authUrl = buildGoogleAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
