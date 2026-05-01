/**
 * /employer/sign-out — POST endpoint that signs out the current user
 * and redirects to the marketing home page.
 *
 * Used by the EmployerShell sidebar's sign-out button.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
