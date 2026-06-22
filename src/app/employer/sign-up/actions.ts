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
import {
  PRICING_TIERS,
  isPricingTier,
  isBillingPeriod,
} from "@/lib/stripe/prices";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { getAcquisition } from "@/lib/analytics/acquisition";
import { recordGoal } from "@/lib/analytics/record-goal";
import { after } from "next/server";

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
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const password = String(formData.get("password") ?? "");
  // Normalize the DSO display name to title case at the data layer so
  // "dso hire" / "DSO HIRE" / "Dso Hire" all land as "Dso Hire" (with
  // the heuristic preserving common all-caps acronyms like DSO, USA,
  // PLLC). Polish item per build-day plan. We do this once at signup;
  // owners can still rename freely later via the DSO profile editor.
  const dsoName = normalizeDsoDisplayName(
    String(formData.get("dso_name") ?? "").trim()
  );
  const headquartersCity = String(formData.get("headquarters_city") ?? "").trim();
  const headquartersState = String(formData.get("headquarters_state") ?? "")
    .trim()
    .toUpperCase();
  const practiceCountRaw = String(formData.get("practice_count") ?? "").trim();
  const tierParam = String(formData.get("tier") ?? "solo").trim();
  const periodParam = String(formData.get("period") ?? "monthly").trim();
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot) {
    return { ok: true, step: "verify", email, message: "Sign-up confirmed." };
  }

  // Validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "form", error: "Please enter a valid email address." };
  }
  if (!firstName || !lastName) {
    return {
      ok: false,
      step: "form",
      error: "Please enter your first and last name.",
    };
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
  const tier = isPricingTier(tierParam) ? tierParam : "solo";
  const billingPeriod = isBillingPeriod(periodParam) ? periodParam : "monthly";

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

  // Vantage §4.6 — stamp last-touch acquisition for the closed-loop funnel.
  const acq = await getAcquisition();
  const { data: dso, error: dsoError } = await admin
    .from("dsos")
    .insert({
      name: dsoName,
      slug,
      headquarters_city: headquartersCity || null,
      headquarters_state: headquartersState,
      practice_count: practiceCount,
      status: "pending",
      acquisition_channel: acq.channel,
      acquisition_source: acq.source,
    })
    .select("id")
    .single();

  if (dsoError || !dso) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      error:
        `Failed to create your DSO record. Please try again or contact ${SUPPORT_EMAIL}.`,
    };
  }

  const { error: dsoUserError } = await admin.from("dso_users").insert({
    auth_user_id: authUserId,
    dso_id: dso.id,
    role: "owner",
    first_name: firstName,
    last_name: lastName,
  });

  if (dsoUserError) {
    await admin.from("dsos").delete().eq("id", dso.id);
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      error:
        `Failed to link your account to the DSO. Please try again or contact ${SUPPORT_EMAIL}.`,
    };
  }

  // Vantage goal — DSO created + owner linked. after() so the write survives the
  // serverless freeze once this action returns (fail-silent, never blocks signup).
  after(() => recordGoal("signup_employer", { channel: acq.channel, tier }));

  await admin.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      full_name: fullName,
      role_during_signup: "employer",
      requested_tier: tier,
      requested_billing_period: billingPeriod,
      requested_tier_price_cents:
        billingPeriod === "annual"
          ? PRICING_TIERS[tier].annualPriceCents
          : PRICING_TIERS[tier].monthlyPriceCents,
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

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * Title-case a DSO display name at the data layer. Preserves common
 * dental/business acronyms in their original casing (DSO, USA, P.C.,
 * PLLC, etc.) AND respects already-mixed-case names (someone typing
 * "MyDentalCorp" gets "MyDentalCorp" back, not "Mydentalcorp"). Polish
 * pass — keeps storefronts looking professional even when the signup
 * form is filled in a hurry on mobile.
 *
 * Heuristic:
 *   • If the input has ANY mixed-case (at least one lowercase AND one
 *     uppercase character beyond the first), assume the user typed it
 *     intentionally and return as-is (just trimmed).
 *   • Otherwise normalize: split on whitespace, lowercase each word,
 *     then capitalize the first letter — UNLESS the word is in the
 *     preserved-acronym set, in which case keep it uppercase.
 */
function normalizeDsoDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  // Mixed-case detection: more than one uppercase or any internal
  // lowercase + uppercase combination = "user typed it intentionally."
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const allUpper = hasUpper && !hasLower;
  const allLower = !hasUpper && hasLower;
  if (hasLower && hasUpper && !allUpper && !allLower) {
    // Mixed already — trust the input but still collapse spaces.
    return trimmed;
  }

  const ACRONYMS = new Set([
    "DSO",
    "USA",
    "US",
    "UK",
    "LLC",
    "PLLC",
    "PC",
    "PA",
    "DDS",
    "DMD",
    "MD",
    "DO",
    "NW",
    "NE",
    "SW",
    "SE",
    "N",
    "S",
    "E",
    "W",
  ]);
  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      // Handle hyphenated tokens: title-case each hyphen-separated piece.
      return word
        .split("-")
        .map((piece) => {
          if (!piece) return piece;
          if (ACRONYMS.has(piece.toUpperCase())) return piece.toUpperCase();
          return (
            piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase()
          );
        })
        .join("-");
    })
    .join(" ");
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
