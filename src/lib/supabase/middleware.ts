/**
 * Supabase middleware client — refreshes the user's session on every request
 * by reading and rewriting the session cookies.
 *
 * Wired into Next.js middleware via /src/middleware.ts (created at the repo
 * root level). Without this, sessions can go stale and signed-in users get
 * unexpectedly signed out.
 *
 * The pattern: read incoming request cookies → call supabase.auth.getUser()
 * to refresh the session → write any updated cookies into the response.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value }: { name: string; value: string; options: CookieOptions }) => {
              request.cookies.set(name, value);
            }
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(
            ({ name, value, options }: { name: string; value: string; options: CookieOptions }) => {
              supabaseResponse.cookies.set(name, value, options);
            }
          );
        },
      },
    }
  );

  // Refreshing the auth token on every request keeps sessions alive.
  // DO NOT remove this — without it, the user gets signed out as soon as the
  // initial JWT expires (~1 hour).
  await supabase.auth.getUser();

  return supabaseResponse;
}
