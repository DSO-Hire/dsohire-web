"use server";

/**
 * confirmSignupCode — server action behind the /auth/confirm-signup page's
 * "Confirm & continue" button.
 *
 * The 6-digit signup email (Supabase Auth "Confirm signup" template, shared
 * across employer + candidate signups) links here with the code prefilled:
 *   {{ .SiteURL }}/auth/confirm-signup?email={{ .Email }}&code={{ .Token }}
 *
 * We verify on the BUTTON PRESS (a POST/action), never on the bare GET, so
 * an email-security link prefetcher can't silently consume the one-time
 * code before the human clicks. Because the Auth template can't tell us
 * whether the signer is an employer or a candidate, we resolve the role
 * AFTER verifyOtp (by which table the now-authed user belongs to) and route
 * accordingly — employer → Stripe checkout (matches verifySignUpEmployer),
 * candidate → dashboard (matches verifySignUpCandidate).
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function confirmSignupCode(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").trim().replace(/\s+/g, "");

  if (!email || !/^\d{6,10}$/.test(token)) {
    redirect(
      `/auth/confirm-signup?email=${encodeURIComponent(email)}&error=invalid`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    const reason = (error?.message ?? "").toLowerCase().includes("expired")
      ? "expired"
      : "invalid";
    redirect(
      `/auth/confirm-signup?email=${encodeURIComponent(email)}&error=${reason}`
    );
  }

  // Route by role. At verify time both rows already exist (created in the
  // sign-up step-1 action), so a dso_users hit means employer, a candidates
  // hit means candidate. Neither → onboarding safety net (mirrors callback).
  const userId = data.user.id;
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (dsoUser) redirect("/employer/checkout");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (candidate) redirect("/candidate/dashboard");

  redirect("/employer/onboarding");
}
