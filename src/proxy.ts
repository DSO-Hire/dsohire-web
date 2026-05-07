/**
 * Next.js proxy (formerly "middleware") — runs on every request before
 * the page renders. Wires Supabase session refresh so signed-in users
 * stay signed in across page loads.
 *
 * Renamed from middleware.ts → proxy.ts 2026-05-07 per Next.js 16
 * deprecation warning. The export name flips from `middleware` →
 * `proxy`; the supporting helper in src/lib/supabase/middleware.ts
 * keeps its filename (internal helper, not the reserved Next.js
 * convention).
 *
 * The matcher excludes static files (images, fonts, etc.) and API
 * routes that don't need session refresh — keeps the proxy fast.
 */

import { type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
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
