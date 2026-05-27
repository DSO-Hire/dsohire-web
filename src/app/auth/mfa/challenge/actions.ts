"use server";

/**
 * MFA sign-in challenge actions (Phase 4.5.d / 2FA TOTP).
 *
 *   - submitChallenge — attempt to verify a 6-digit TOTP code OR a
 *     recovery code. On TOTP success, Supabase upgrades the session AAL
 *     to aal2. On recovery-code success, we mark the code consumed AND
 *     delete the factor (admin API) so the user re-enrolls fresh after
 *     signing in.
 *
 * Recovery-code path explanation:
 *   • Anyone who hits this endpoint is already signed in at aal1 (i.e.
 *     they completed primary auth via OTP or password). The challenge
 *     here is to step up to aal2.
 *   • If the user lost their authenticator, they fall back to a recovery
 *     code. Once consumed, we delete the factor server-side via the
 *     admin API so the layout guard stops requiring aal2 (no factor =
 *     no challenge needed). The user is then prompted on next page load
 *     to re-enroll TOTP from the Account Settings.
 *   • Service-role lookups go through createSupabaseServiceRoleClient.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  hashRecoveryCode,
  looksLikeRecoveryCode,
} from "@/lib/auth/mfa";
import { setMfaTrustCookie } from "@/lib/auth/mfa-trust";

export interface ChallengeState {
  ok: boolean;
  error?: string;
  /** When the action chose a redirect, the target URL. */
  redirectTo?: string;
  /** True when consumed via recovery code — UI shows a re-enroll nudge. */
  consumedRecoveryCode?: boolean;
}

export async function submitChallenge(
  _prev: ChallengeState,
  formData: FormData
): Promise<ChallengeState> {
  const raw = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  const safeNext = isSafeNext(next) ? next : null;
  // Checkbox value — present + "on" means the user opted into trusting
  // the device for 30 days. Only honored on a successful TOTP verify
  // (NOT on a recovery-code consumption — at that point the factor is
  // being deleted, so a trust cookie tied to its id would be useless).
  const trustDevice = String(formData.get("trust_device") ?? "") === "on";

  if (!raw) {
    return { ok: false, error: "Enter a code to continue." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  // factors.totp contains verified TOTP factors only; pick the first one.
  const verifiedFactor = factors?.totp?.[0];
  if (!verifiedFactor) {
    // Nothing to challenge against — caller probably reached this page
    // by accident. Push to dashboard.
    redirect(safeNext ?? "/employer/dashboard");
  }

  // Try TOTP path first if it looks like a 6-digit code.
  const looksLikeTotp = /^\d{6}$/.test(raw.replace(/\s+/g, ""));
  if (looksLikeTotp) {
    const code = raw.replace(/\s+/g, "");
    const { data: chData, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: verifiedFactor.id,
    });
    if (chErr || !chData) {
      return {
        ok: false,
        error: chErr?.message ?? "Couldn't start a challenge. Try again.",
      };
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: verifiedFactor.id,
      challengeId: chData.id,
      code,
    });
    if (!vErr) {
      // AAL upgraded — set the trust-this-device cookie if the user
      // opted in, then proceed. Cookie auto-no-ops in dev when
      // MFA_TRUST_SECRET is unset.
      if (trustDevice) {
        const cookieStore = await cookies();
        setMfaTrustCookie(cookieStore, {
          authUserId: user.id,
          factorId: verifiedFactor.id,
        });
      }
      redirect(safeNext ?? "/employer/dashboard");
    }
    // Fall through to recovery-code path if it ALSO looks like a recovery
    // code (rare). Otherwise return TOTP failure.
    if (!looksLikeRecoveryCode(raw)) {
      return {
        ok: false,
        error: "That code didn't match. Check your authenticator and try again.",
      };
    }
  }

  // Recovery-code path.
  if (looksLikeRecoveryCode(raw)) {
    const admin = createSupabaseServiceRoleClient();
    const hash = hashRecoveryCode(raw);

    const { data: matchRow } = await admin
      .from("mfa_recovery_codes")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();

    if (!matchRow) {
      return {
        ok: false,
        error:
          "That recovery code didn't match an active code. Each code works only once.",
      };
    }

    // Mark consumed.
    await admin
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", matchRow.id as string);

    // Delete the verified factor so the user can sign in normally on the
    // next page load and re-enroll fresh.
    await admin.auth.admin.mfa.deleteFactor({
      userId: user.id,
      id: verifiedFactor.id,
    });

    // Wipe the rest of the recovery codes — they're tied to a factor
    // that no longer exists.
    await admin
      .from("mfa_recovery_codes")
      .delete()
      .eq("auth_user_id", user.id);

    redirect(
      `${safeNext ?? "/employer/dashboard"}?recovery_used=1`
    );
  }

  return {
    ok: false,
    error:
      "Enter the 6-digit code from your authenticator, or a recovery code (e.g. abcd-efgh-jkmn).",
  };
}

/**
 * Allow only same-origin relative paths in `next`. Drop anything that
 * looks like an attempt to navigate elsewhere.
 */
function isSafeNext(next: string): boolean {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}
