/**
 * Next.js middleware — runs on every request before the page renders.
 * Wires Supabase session refresh so signed-in users stay signed in across
 * page loads.
 *
 * The matcher excludes static files (images, fonts, etc.) and API routes
 * that don't need session refresh — keeps middleware fast.
 */

import { type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
