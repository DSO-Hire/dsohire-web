/**
 * /auth/callback — Supabase magic-link landing handler.
 *
 * The flow:
 *   1. User submits email on /employer/sign-in or /employer/sign-up
 *   2. Supabase emails them a link like https://dsohire.com/auth/callback?code=ABC123&next=/employer/dashboard
 *   3. They click → this route hits → we exchange the code for a session,
 *      set the auth cookie, and redirect them where they were headed
 *
 * If the user has no DSO row yet (first sign-in), we route them to onboarding.
 * If they have a DSO, we route to the requested `next` URL or dashboard.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/employer/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`
    );
  }

  // After exchanging the code, check whether this user already has a DSO
  // associated with them. New users (first sign-up) need onboarding.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no_user`);
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // No DSO row yet → either a candidate or a brand-new employer mid-onboarding.
  if (!dsoUser) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (candidate) {
      // Candidate: honor the requested `next` IF it's a candidate-safe path
      // (e.g. /jobs/[id]/apply); otherwise default to candidate dashboard.
      const safeNext =
        requestedNext.startsWith("/candidate") || requestedNext.startsWith("/jobs/")
          ? requestedNext
          : "/candidate/dashboard";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    // No candidate or DSO row → must be a fresh employer sign-up that
    // hasn't created its DSO row yet (rare; sign-up creates everything).
    // Send to onboarding as a safety net.
    return NextResponse.redirect(`${origin}/employer/onboarding`);
  }

  return NextResponse.redirect(`${origin}${requestedNext}`);
}
