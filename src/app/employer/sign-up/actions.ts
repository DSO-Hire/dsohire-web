"use server";

/**
 * /employer/sign-up server action.
 *
 * Creates the auth user, DSO, and dso_users (owner) rows atomically using
 * the Supabase service-role client. Then sends a magic-link email so the
 * user verifies their email before they can sign in.
 *
 * Slug generation per Q5 decision: auto-derive from name, validate against
 * reserved words, append numeric suffix on collision.
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { PricingTier } from "@/lib/stripe/prices";
import { PRICING_TIERS } from "@/lib/stripe/prices";

export interface SignUpState {
  ok: boolean;
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
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dsoName = String(formData.get("dso_name") ?? "").trim();
  const headquartersCity = String(formData.get("headquarters_city") ?? "").trim();
  const headquartersState = String(
    formData.get("headquarters_state") ?? ""
  )
    .trim()
    .toUpperCase();
  const practiceCountRaw = String(formData.get("practice_count") ?? "").trim();
  const tierParam = String(formData.get("tier") ?? "starter").trim();
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot) {
    return { ok: true, email, message: "Sign-up confirmed." };
  }

  // Validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, error: "Please enter your full name." };
  }
  if (!dsoName) {
    return { ok: false, error: "Please enter your DSO name." };
  }
  if (!headquartersState || headquartersState.length !== 2) {
    return {
      ok: false,
      error: "Please enter a 2-letter US state code (e.g., KS, TX).",
    };
  }
  const practiceCount = parseInt(practiceCountRaw, 10);
  if (Number.isNaN(practiceCount) || practiceCount < 1) {
    return { ok: false, error: "Please enter your number of practice locations." };
  }
  const tier = isPricingTier(tierParam) ? tierParam : "starter";

  const baseSlug = makeSlug(dsoName);
  if (!baseSlug) {
    return {
      ok: false,
      error:
        "We couldn't generate a URL slug from your DSO name. Try a different name.",
    };
  }

  // Server-side mutations: use service-role client to bypass RLS
  const admin = createSupabaseServiceRoleClient();

  // Check for slug collision; suffix with -2, -3, etc. if needed
  const slug = await resolveAvailableSlug(admin, baseSlug);

  // Create the auth user (or look up existing). signInWithOtp with
  // shouldCreateUser=true would create + email-link in one call, but we want
  // to create our DSO rows first and link them BEFORE the user verifies.
  // So we use admin.createUser to create, then send a magic link separately.
  const {
    data: createdUser,
    error: createUserError,
  } = await admin.auth.admin.createUser({
    email,
    email_confirm: false, // user verifies via magic link, not auto-confirmed
    user_metadata: {
      full_name: fullName,
      role_during_signup: "employer",
    },
  });

  if (createUserError || !createdUser?.user) {
    if (createUserError?.message?.toLowerCase().includes("already")) {
      return {
        ok: false,
        error:
          "An account with this email already exists. Sign in instead — we'll send you a fresh magic link.",
      };
    }
    return {
      ok: false,
      error: createUserError?.message ?? "Failed to create user account.",
    };
  }

  const authUserId = createdUser.user.id;

  // Create the DSO row (status: pending — Cam manually activates Founding tier)
  const {
    data: dso,
    error: dsoError,
  } = await admin
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
    // Roll back the auth user if DSO insert failed
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      error:
        "Failed to create your DSO record. Please try again or contact cam@dsohire.com.",
    };
  }

  // Create the dso_users row (owner)
  const { error: dsoUserError } = await admin.from("dso_users").insert({
    auth_user_id: authUserId,
    dso_id: dso.id,
    role: "owner",
    full_name: fullName,
  });

  if (dsoUserError) {
    // Roll back auth user + DSO
    await admin.from("dsos").delete().eq("id", dso.id);
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      error:
        "Failed to link your account to the DSO. Please try again or contact cam@dsohire.com.",
    };
  }

  // Stash tier in user metadata so the onboarding flow knows what was chosen.
  await admin.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      full_name: fullName,
      role_during_signup: "employer",
      requested_tier: tier,
      requested_tier_price_cents: PRICING_TIERS[tier].monthlyPriceCents,
    },
  });

  // Send the magic-link email so the user verifies and signs in
  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // user already exists, just send the link
      emailRedirectTo: `${origin}/auth/callback?next=/employer/onboarding`,
    },
  });

  if (otpError) {
    return {
      ok: false,
      error:
        "Account created but we couldn't send the verification email. Try signing in.",
    };
  }

  return {
    ok: true,
    email,
    message: `Check your inbox — we sent a verification link to ${email}. Click it to finish setting up your DSO.`,
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

  // Check if slug is taken
  const { data: existing } = await admin
    .from("dsos")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle();

  if (!existing) return baseSlug;

  // Try suffixed variants
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    const { data: clash } = await admin
      .from("dsos")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }

  // Fallback: random suffix
  return `${baseSlug}-${Math.floor(Math.random() * 100000)}`;
}
