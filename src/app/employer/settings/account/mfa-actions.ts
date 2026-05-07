"use server";

/**
 * MFA server actions (Phase 4.5.d / 2FA TOTP).
 *
 *   - enrollTotp                — start a new TOTP factor; returns QR + secret
 *   - verifyEnrollment          — verify the first code; finalize factor +
 *                                 mint 10 fresh recovery codes (returns
 *                                 plaintext once, hashes stored server-side)
 *   - disableMfa                — verify TOTP first, then unenroll factor +
 *                                 wipe recovery codes
 *   - regenerateRecoveryCodes   — verify TOTP first, then issue fresh batch
 *   - cancelEnrollment          — drop an unverified factor (used when the
 *                                 user cancels mid-flow)
 *   - setOrgRequireMfa          — Enterprise + owner-only org-wide toggle
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/auth/mfa";
import { getActiveSubscription } from "@/lib/billing/subscription";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Please sign in." };
  }
  return { ok: true as const, supabase, user };
}

/* ──────────────────────────────────────────────────────────────
 * Enrollment
 * ─────────────────────────────────────────────────────────── */

export async function enrollTotp(): Promise<
  Result<{ factorId: string; qrCode: string; secret: string; uri: string }>
> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  // If a stale unverified factor exists, drop it first so re-runs don't
  // pile up factors on the user.
  const { data: factors } = await ctx.supabase.auth.mfa.listFactors();
  const stale = factors?.totp?.find((f) => f.status === "unverified");
  if (stale) {
    await ctx.supabase.auth.mfa.unenroll({ factorId: stale.id });
  }

  const { data, error } = await ctx.supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "DSO Hire",
  });
  if (error || !data) {
    console.error("[mfa/enrollTotp]", error);
    return {
      ok: false,
      error: error?.message ?? "Couldn't start 2FA setup. Try again.",
    };
  }

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyEnrollment(input: {
  factorId: string;
  code: string;
}): Promise<Result<{ recoveryCodes: string[] }>> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const trimmed = input.code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator." };
  }

  const { data: chData, error: chErr } = await ctx.supabase.auth.mfa.challenge(
    { factorId: input.factorId }
  );
  if (chErr || !chData) {
    console.error("[mfa/verifyEnrollment challenge]", chErr);
    return {
      ok: false,
      error: chErr?.message ?? "Couldn't start the verification challenge.",
    };
  }

  const { error: vErr } = await ctx.supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: chData.id,
    code: trimmed,
  });
  if (vErr) {
    return {
      ok: false,
      error: "That code didn't match. Check your authenticator and try again.",
    };
  }

  // Generate + persist recovery codes (service-role bypasses RLS).
  const codes = generateRecoveryCodes();
  const admin = createSupabaseServiceRoleClient();

  // Wipe any old codes from a prior enrollment.
  await admin
    .from("mfa_recovery_codes")
    .delete()
    .eq("auth_user_id", ctx.user.id);

  const { error: insertErr } = await admin.from("mfa_recovery_codes").insert(
    codes.map((c) => ({
      auth_user_id: ctx.user.id,
      code_hash: hashRecoveryCode(c),
    }))
  );
  if (insertErr) {
    console.error("[mfa/verifyEnrollment insert recovery codes]", insertErr);
    // The factor is verified but codes failed — the user can regenerate.
    revalidatePath("/employer/settings/account");
    return { ok: true, recoveryCodes: [] };
  }

  revalidatePath("/employer/settings/account");
  return { ok: true, recoveryCodes: codes };
}

export async function cancelEnrollment(input: {
  factorId: string;
}): Promise<Result> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;
  await ctx.supabase.auth.mfa.unenroll({ factorId: input.factorId });
  revalidatePath("/employer/settings/account");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Disable
 * ─────────────────────────────────────────────────────────── */

export async function disableMfa(input: {
  factorId: string;
  code: string;
}): Promise<Result> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const trimmed = input.code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter the 6-digit code to confirm." };
  }

  // Re-verify before destroying the factor.
  const { data: chData, error: chErr } = await ctx.supabase.auth.mfa.challenge(
    { factorId: input.factorId }
  );
  if (chErr || !chData) {
    return { ok: false, error: chErr?.message ?? "Couldn't verify." };
  }

  const { error: vErr } = await ctx.supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: chData.id,
    code: trimmed,
  });
  if (vErr) {
    return {
      ok: false,
      error: "That code didn't match. 2FA is still on.",
    };
  }

  const { error: unenrollErr } = await ctx.supabase.auth.mfa.unenroll({
    factorId: input.factorId,
  });
  if (unenrollErr) {
    return { ok: false, error: unenrollErr.message };
  }

  const admin = createSupabaseServiceRoleClient();
  await admin
    .from("mfa_recovery_codes")
    .delete()
    .eq("auth_user_id", ctx.user.id);

  revalidatePath("/employer/settings/account");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Regenerate recovery codes
 * ─────────────────────────────────────────────────────────── */

export async function regenerateRecoveryCodes(input: {
  factorId: string;
  code: string;
}): Promise<Result<{ recoveryCodes: string[] }>> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const trimmed = input.code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter the 6-digit code to confirm." };
  }

  const { data: chData, error: chErr } = await ctx.supabase.auth.mfa.challenge(
    { factorId: input.factorId }
  );
  if (chErr || !chData) {
    return { ok: false, error: "Couldn't verify." };
  }
  const { error: vErr } = await ctx.supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: chData.id,
    code: trimmed,
  });
  if (vErr) {
    return { ok: false, error: "That code didn't match." };
  }

  const codes = generateRecoveryCodes();
  const admin = createSupabaseServiceRoleClient();
  await admin
    .from("mfa_recovery_codes")
    .delete()
    .eq("auth_user_id", ctx.user.id);
  await admin.from("mfa_recovery_codes").insert(
    codes.map((c) => ({
      auth_user_id: ctx.user.id,
      code_hash: hashRecoveryCode(c),
    }))
  );

  revalidatePath("/employer/settings/account");
  return { ok: true, recoveryCodes: codes };
}

/* ──────────────────────────────────────────────────────────────
 * Org-wide enforcement (Enterprise toggle)
 * ─────────────────────────────────────────────────────────── */

export async function setOrgRequireMfa(input: {
  enabled: boolean;
}): Promise<Result> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const { data: dsoUser } = await ctx.supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", ctx.user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership." };
  if ((dsoUser.role as string) !== "owner") {
    return { ok: false, error: "Only the DSO owner can change this." };
  }

  // Enterprise tier gate.
  const sub = await getActiveSubscription(ctx.supabase, dsoUser.dso_id as string);
  if (!sub || sub.tier !== "enterprise") {
    return {
      ok: false,
      error:
        "Org-wide MFA enforcement is an Enterprise feature. Contact us to upgrade.",
    };
  }

  // If turning ON, the owner must already have MFA on themselves so they
  // don't lock themselves out at the next sign-in.
  if (input.enabled) {
    const { data: factors } = await ctx.supabase.auth.mfa.listFactors();
    const hasVerified = !!factors?.totp?.some((f) => f.status === "verified");
    if (!hasVerified) {
      return {
        ok: false,
        error: "Set up 2FA on your own account first, then enable org-wide.",
      };
    }
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ require_mfa: input.enabled })
    .eq("id", dsoUser.dso_id as string);
  if (error) {
    console.error("[mfa/setOrgRequireMfa]", error);
    return { ok: false, error: "Couldn't save the setting." };
  }

  revalidatePath("/employer/settings/account");
  return { ok: true };
}
