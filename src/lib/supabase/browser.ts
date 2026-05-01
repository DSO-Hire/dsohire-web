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

// Generic <Database> dropped — see comment in server.ts. Re-add at task #32.

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
