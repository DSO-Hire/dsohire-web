/**
 * Supabase browser client — for use in Client Components.
 *
 * Reads/writes session cookies in the browser. Use in any "use client" code
 * that needs to call Supabase directly (sign-in forms, client-side mutations,
 * realtime subscriptions).
 *
 * Example:
 *   "use client";
 *   import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
 *
 *   export function SignInButton() {
 *     const handleClick = async () => {
 *       const supabase = createSupabaseBrowserClient();
 *       await supabase.auth.signInWithOtp({ email: 'cam@example.com' });
 *     };
 *     // ...
 *   }
 *
 * For Server Components and Server Actions, use `createSupabaseServerClient`
 * from './server' instead.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
