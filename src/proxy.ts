/**
 * Next.js proxy (formerly "middleware") — runs on every request before
 * the page renders. Two responsibilities, in order:
 *
 *   1. PRE-LAUNCH "coming soon" gate (testing period). The whole site shows
 *      seeded/demo data, so every page is gated behind a branded coming-soon
 *      screen. Visitors with a valid access-code cookie pass through. Testers
 *      unlock by visiting any URL with ?preview=<code> once (sets a 90-day
 *      cookie) or by entering the code on the coming-soon page. The code is
 *      PREVIEW_ACCESS_CODE (set in Vercel to rotate without a deploy); it
 *      falls back to "wrigley". Set PREVIEW_GATE_DISABLED=true to turn the
 *      gate off (e.g. at launch), or delete this block.
 *
 *   2. Supabase session refresh so signed-in users stay signed in across
 *      page loads (the original job of this file).
 *
 * Gate-exempt paths (still get session refresh, never the gate): /api/*
 * (machine endpoints — Resend webhook + one-click unsubscribe must work
 * without a cookie), /unsubscribe (CAN-SPAM page), /coming-soon itself,
 * robots.txt, sitemap.xml, and the metadata image routes.
 *
 * Renamed from middleware.ts → proxy.ts 2026-05-07 per Next.js 16. The
 * matcher excludes static files so the proxy stays fast.
 */

import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const PREVIEW_COOKIE = "dsohire_preview";
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE || "wrigley";

/** Paths the coming-soon gate must never block. */
function isGateExempt(pathname: string): boolean {
  return (
    pathname === "/coming-soon" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    // Vantage analytics beacon — a machine endpoint (like /api/*) that must
    // fire without the preview cookie, so we capture pre-launch landing traffic
    // too. Neutral path /p/e (not /api/*) for ad-blocker resilience.
    pathname === "/p/e" ||
    // Job-distribution feeds — machine endpoints (Indeed/LinkedIn crawlers
    // can't carry the preview cookie). They self-gate on the launch flag and
    // serve an empty feed pre-launch, so exempting them never leaks data.
    pathname.startsWith("/feeds/") ||
    // Embeddable careers surfaces — frameable iframe + widget.js + the public
    // JSON API. Machine/cross-origin endpoints; they self-gate on the launch
    // flag (empty/zero jobs pre-launch), so exemption never leaks data.
    pathname.startsWith("/embed/") ||
    pathname.startsWith("/unsubscribe") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/icon")
  );
}

export async function proxy(request: NextRequest) {
  const gateOn = process.env.PREVIEW_GATE_DISABLED !== "true";
  const { pathname, searchParams } = request.nextUrl;

  if (gateOn && !isGateExempt(pathname)) {
    const unlocked = request.cookies.get(PREVIEW_COOKIE)?.value === ACCESS_CODE;
    if (!unlocked) {
      // Code submitted via ?preview= on any path → set cookie, drop the param.
      const submitted = searchParams.get("preview");
      if (submitted && submitted === ACCESS_CODE) {
        const dest = request.nextUrl.clone();
        dest.searchParams.delete("preview");
        const res = NextResponse.redirect(dest);
        res.cookies.set({
          name: PREVIEW_COOKIE,
          value: ACCESS_CODE,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 90, // 90 days
        });
        return res;
      }
      // Locked → show the gate but keep the requested URL (rewrite, not
      // redirect) so a deep link survives once the tester enters the code.
      return NextResponse.rewrite(new URL("/coming-soon", request.url));
    }
  }

  // Unlocked, exempt, or gate disabled → normal Supabase session refresh.
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icon.svg, logo files
     * - public assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|logo-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
