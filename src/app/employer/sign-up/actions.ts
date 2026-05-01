"use server";

/**
 * /employer/sign-up — two-step flow.
 *
 * Step 1 (signUpEmployer): create auth user via service-role + DSO row + dso_users
 *   row, then call signInWithOtp WITHOUT emailRedirectTo to send a 6-digit
 *   verification code.
 * Step 2 (verifySignUpEmployer): user enters the code → verifyOtp sets the
 *   session → redirect to /employer/onboarding.
 *
 * Slug generation per Q5 decision: auto-derive from name, validate against
 * reserved words, append numeric suffix on collision.
 */

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { PricingTier } from "@/lib/stripe/prices";
import { PRICING_TIERS } from "@/lib/stripe/prices";

export interface SignUpState {
  ok: boolean;
  step: "form" | "verify";
  error?: string;
  message?: string;
  email?: string;
}

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "employer",
  "candidate",
  "pricing",
  "about",
  "contact",
  "legal",
  "jobs",
  "companies",
  "for-dsos",
  "post-a-job",
  "support",
  "help",
  "login",
  "logout",
  "sign-in",
  "sign-up",
  "claude",
  "dso-hire",
  "dsohire",
  "www",
  "mail",
  "ftp",
  "smtp",
  "blog",
  "status",
  "auth",
]);

export async function signUpEmployer(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const dsoName = String(formData.get("dso_name") ?? "").trim();
  const headquartersCity = String(formData.get("headquarters_city") ?? "").trim();
  const headquartersState = String(formData.get("headquarters_state") ?? "")
    .trim()
    .toUpperCase();
  const practiceCountRaw = String(formData.get("practice_count") ?? "").trim();
  const tierParam = String(formData.get("tier") ?? "starter").trim();
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot) {
    return { ok: true, step: "verify", email, message: "Sign-up confirmed." };
  }

  // Validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "form", error: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, step: "form", error: "Please enter your full name." };
  }
  if (!dsoName) {
    return { ok: false, step: "form", error: "Please enter your DSO name." };
  }
  if (!headquartersState || headquartersState.length !== 2) {
    return {
      ok: false,
      step: "form",
      error: "Please enter a 2-letter US state code (e.g., KS, TX).",
    };
  }
  const practiceCount = parseInt(practiceCountRaw, 10);
  if (Number.isNaN(practiceCount) || practiceCount < 1) {
    return {
      ok: false,
      step: "form",
      error: "Please enter your number of practice locations.",
    };
  }
  if (password && password.length < 8) {
    return {
      ok: false,
      step: "form",
      error: "If you're setting a password, it needs to be at least 8 characters. Or leave it blank — you can sign in via emailed code.",
    };
  }
  const tier = isPricingTier(tierParam) ? tierParam : "starter";

  const baseSlug = makeSlug(dsoName);
  if (!baseSlug) {
    return {
      ok: false,
      step: "form",
      error:
        "We couldn't generate a URL slug from your DSO name. Try a different name.",
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const slug = await resolveAvailableSlug(admin, baseSlug);

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      ...(password ? { password } : {}),
      user_metadata: {
        full_name: fullName,
        role_during_signup: "employer",
      },
    });

  if (createUserError || !createdUser?.user) {
    if (createUserError?.message?.toLowerCase().includes("already")) {
      return {
        ok: false,
        step: "form",
        error:
          "An account with this email already exists. Sign in instead — we'll send you a fresh code.",
      };
    }
    return {
      ok: false,
      step: "form",
      error: createUserError?.message ?? "Failed to create user account.",
    };
  }

  const authUserId = createdUser.user.id;

  const { data: dso, error: dsoError } = await admin
    .from("dsos")
    .insert({
      name: dsoName,
      slug,
      headquarters_city: headquartersCity || null,
      headquarters_state: headquartersState,
      practice_count: practiceCount,
      status: "pending",
    })
    .select("id")
    .single();

  if (dsoError || !dso) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      error:
        "Failed to create your DSO record. Please try again or contact cam@dsohire.com.",
    };
  }

  const { error: dsoUserError } = await admin.from("dso_users").insert({
    auth_user_id: authUserId,
    dso_id: dso.id,
    role: "owner",
    full_name: fullName,
  });

  if (dsoUserError) {
    await admin.from("dsos").delete().eq("id", dso.id);
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      error:
        "Failed to link your account to the DSO. Please try again or contact cam@dsohire.com.",
    };
  }

  await admin.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      full_name: fullName,
      role_during_signup: "employer",
      requested_tier: tier,
      requested_tier_price_cents: PRICING_TIERS[tier].monthlyPriceCents,
    },
  });

  // Send the 6-digit verification code (no emailRedirectTo = OTP-only).
  const supabase = await createSupabaseServerClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // user already exists, just send the code
    },
  });

  if (otpError) {
    return {
      ok: false,
      step: "form",
      error:
        "Account created but we couldn't send the verification email. Try signing in.",
    };
  }

  return {
    ok: true,
    step: "verify",
    email,
    message: `We sent a 6-digit verification code to ${email}. Enter it below — it expires in 15 minutes.`,
  };
}

export async function verifySignUpEmployer(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");

  if (!email || !token) {
    return {
      ok: false,
      step: "verify",
      email,
      error: "Enter the 6-digit code from your email.",
    };
  }
  if (!/^\d{6,10}$/.test(token)) {
    return {
      ok: false,
      step: "verify",
      email,
      error: "That doesn't look like a valid code. Enter the digits from your email.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    const lower = (error?.message ?? "").toLowerCase();
    return {
      ok: false,
      step: "verify",
      email,
      error: lower.includes("expired")
        ? "That code expired. Click \"Send a new code\" to get a fresh one."
        : "That code didn't match. Check the email and try again, or request a new code.",
    };
  }

  // After verification, send them to Stripe Checkout (sign-up step 3).
  // /employer/checkout reads the requested_tier from user_metadata, creates
  // a session, and redirects to Stripe-hosted checkout. After payment, Stripe
  // redirects back to /employer/checkout/success → /employer/onboarding.
  redirect("/employer/checkout");
}

export async function resendSignUpCode(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, step: "verify", error: "Missing email." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    return {
      ok: false,
      step: "verify",
      email,
      error: "Couldn't resend. Wait a minute and try again.",
    };
  }
  return {
    ok: true,
    step: "verify",
    email,
    message: `New code sent to ${email}.`,
  };
}

/* ───── helpers ───── */

function isPricingTier(v: string): v is PricingTier {
  return v === "founding" || v === "starter" || v === "growth" || v === "enterprise";
}

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

async function resolveAvailableSlug(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  baseSlug: string
): Promise<string> {
  if (RESERVED_SLUGS.has(baseSlug)) {
    return resolveAvailableSlug(admin, `${baseSlug}-dso`);
  }

  const { data: existing } = await admin
    .from("dsos")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle();

  if (!existing) return baseSlug;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    const { data: clash } = await admin
      .from("dsos")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }

  return `${baseSlug}-${Math.floor(Math.random() * 100000)}`;
}
