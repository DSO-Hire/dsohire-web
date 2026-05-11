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
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

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

    // Guest-claim path: if the freshly-signed-in user matches a guest
    // candidate by email AND no auth-linked candidate row exists yet,
    // promote the guest row by setting auth_user_id and flipping
    // is_guest=false. Uses the service-role client to bypass RLS (the
    // candidate row has auth_user_id=null today, so the user's session
    // can't update it themselves).
    if (!candidate && user.email) {
      const admin = createSupabaseServiceRoleClient();
      const { data: guestRow } = await admin
        .from("candidates")
        .select("id, claim_expires_at")
        .ilike("email", user.email)
        .eq("is_guest", true)
        .maybeSingle();
      if (guestRow) {
        const expiresAt = guestRow.claim_expires_at as string | null;
        const stillClaimable = !expiresAt || new Date(expiresAt) > new Date();
        if (stillClaimable) {
          const { error: claimErr } = await admin
            .from("candidates")
            .update({
              auth_user_id: user.id,
              is_guest: false,
              email: null, // post-claim, auth.users is source of truth
              claim_expires_at: null,
            })
            .eq("id", guestRow.id as string);
          if (!claimErr) {
            return NextResponse.redirect(
              `${origin}${requestedNext.startsWith("/") ? requestedNext : "/candidate/dashboard"}`
            );
          }
          console.warn("[auth/callback] guest claim failed", claimErr);
        }
      }
    }

    if (candidate) {
      // Candidate: honor the requested `next` IF it's a candidate-safe path
      // (e.g. /jobs/[id]/apply); otherwise default to candidate dashboard.
      const safeNext =
        requestedNext.startsWith("/candidate") || requestedNext.startsWith("/jobs/")
          ? requestedNext
          : "/candidate/dashboard";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    // Heuristic: candidate-side OAuth sign-up (E2.6 LinkedIn etc.).
    // If the `next` looks like a candidate path AND the OAuth provider
    // claims indicate a fresh user (no candidate row, no dso_users row),
    // provision the candidates row via service role and route the user
    // into their dashboard / apply continuation.
    //
    // We treat the absence of `role_during_signup === "candidate"` as
    // permissive — an OAuth user has no signup form to set it. Instead we
    // gate on the `next` path: candidate-shaped → candidate; otherwise
    // route to a small picker (deferred for v1; route to candidate by
    // default because the OAuth button only ships on candidate surfaces).
    const looksLikeCandidate =
      requestedNext.startsWith("/candidate") ||
      requestedNext.startsWith("/jobs/") ||
      requestedNext.startsWith("/auth/") ||
      requestedNext === "/employer/dashboard"; // default value — treat as needing candidate

    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const roleHint = userMeta.role_during_signup as string | undefined;

    if (looksLikeCandidate && roleHint !== "employer") {
      const admin = createSupabaseServiceRoleClient();
      const fullName =
        (userMeta.full_name as string | undefined) ??
        (userMeta.name as string | undefined) ??
        (user.email ?? "Candidate").split("@")[0];
      const { error: provisionErr } = await admin
        .from("candidates")
        .insert({
          auth_user_id: user.id,
          email: user.email,
          full_name: fullName,
        });
      if (provisionErr) {
        console.warn(
          "[auth/callback] OAuth candidate provision failed",
          provisionErr
        );
        return NextResponse.redirect(
          `${origin}/auth/error?reason=${encodeURIComponent(provisionErr.message)}`
        );
      }
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
