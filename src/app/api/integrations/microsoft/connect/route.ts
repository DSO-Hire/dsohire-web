/**
 * /api/integrations/microsoft/connect — initiate Microsoft Calendar OAuth.
 *
 * Mirrors the Google connect route. See that file for the full flow
 * narrative — the only deltas here are the cookie name, the consent
 * URL, and that Microsoft prompt mode is `select_account` (handled
 * inside `buildMicrosoftAuthUrl`).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildMicrosoftAuthUrl } from "@/lib/integrations/oauth-microsoft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "oauth_state_microsoft";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const FALLBACK_NEXT = "/employer/settings/integrations";

function sanitizeNext(next: string | null): string {
  if (!next) return FALLBACK_NEXT;
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

  const authUrl = buildMicrosoftAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
