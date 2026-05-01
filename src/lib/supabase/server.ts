/**
 * Supabase server client — for use in Server Components, Server Actions,
 * and Route Handlers.
 *
 * Reads cookies on the request, so the user's session is available. Use this
 * in any code that runs on the server and needs to know who's signed in.
 *
 * Example:
 *   import { createSupabaseServerClient } from '@/lib/supabase/server';
 *
 *   export default async function Page() {
 *     const supabase = await createSupabaseServerClient();
 *     const { data: { user } } = await supabase.auth.getUser();
 *     // ...
 *   }
 *
 * NEVER use this in Client Components — they can't read cookies on the server.
 * Use `createSupabaseBrowserClient` for client-side code.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// NOTE: Generic <Database> dropped temporarily — our hand-written
// database.types.ts doesn't include the Relationships fields newer Supabase
// versions expect, which breaks query-result inference. Regenerate from CLI
// in Phase 2 Week 2 (task #32) and re-add the generic.

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Use only in trusted server contexts
 * (admin actions, webhook handlers, cron jobs). NEVER expose to the browser.
 */
export function createSupabaseServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No-op — service-role client doesn't manage cookies.
        },
      },
    }
  );
}
