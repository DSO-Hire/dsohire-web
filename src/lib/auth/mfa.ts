/**
 * MFA helpers (Phase 4.5.d / 2FA TOTP).
 *
 * Recovery codes are 12-char `xxxx-xxxx-xxxx` strings using a shortened
 * alphabet (no `l`, `0`, `1`, `o` to avoid visual ambiguity). Generated
 * with `crypto.randomBytes` (Node) and stored as a sha256 hash. Plaintext
 * is shown to the user once at generation; we never show it again.
 *
 * AAL checks (`supabase.auth.getAuthenticatorAssuranceLevel`) are wrapped
 * in `userNeedsMfaChallenge` so the sign-in code paths + layout guard
 * share a single decision.
 */

import { randomBytes, createHash } from "crypto";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const RECOVERY_CODES_COUNT = 10;

const CODE_GROUP_LEN = 4;
const CODE_GROUPS = 3;
// Shortened alphabet — drops 0/1/l/o to avoid OCR/transcription confusion.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Generate a single recovery code, e.g. `a3b9-x7yz-q2k8`. */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    const buf = randomBytes(CODE_GROUP_LEN);
    let part = "";
    for (let i = 0; i < CODE_GROUP_LEN; i++) {
      part += ALPHABET[buf[i] % ALPHABET.length];
    }
    groups.push(part);
  }
  return groups.join("-");
}

/** Generate a fresh batch of recovery codes (default 10). */
export function generateRecoveryCodes(
  count: number = RECOVERY_CODES_COUNT
): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

/** Stable hash for storage. We compare against this on consumption. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.trim().toLowerCase().replace(/-/g, ""))
    .digest("hex");
}

export function looksLikeRecoveryCode(input: string): boolean {
  // 12 alphanumeric chars after stripping dashes/whitespace.
  const stripped = input.replace(/[-\s]/g, "");
  return /^[a-z0-9]{12}$/i.test(stripped);
}

/* ──────────────────────────────────────────────────────────────
 * AAL helpers
 * ─────────────────────────────────────────────────────────── */

export interface MfaState {
  /** True iff the user has at least one verified TOTP factor. */
  isEnrolled: boolean;
  /** Current AAL of the session. */
  currentLevel: "aal1" | "aal2" | null;
  /** AAL the user could reach if they completed a challenge. */
  nextLevel: "aal1" | "aal2" | null;
  /** Verified factor id (when enrolled). Used by the challenge endpoint. */
  verifiedFactorId: string | null;
  /** Unverified factor id (when in the middle of enrollment). */
  unverifiedFactorId: string | null;
}

export async function getMfaState(supabase: SupabaseClient): Promise<MfaState> {
  const [aalRes, factorsRes] = await Promise.all([
    supabase.auth.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const factors = factorsRes.data;
  const verified =
    factors?.totp?.find((f) => f.status === "verified") ?? null;
  const unverified =
    factors?.totp?.find((f) => f.status === "unverified") ?? null;

  return {
    isEnrolled: !!verified,
    currentLevel:
      (aalRes.data?.currentLevel as MfaState["currentLevel"]) ?? null,
    nextLevel: (aalRes.data?.nextLevel as MfaState["nextLevel"]) ?? null,
    verifiedFactorId: verified?.id ?? null,
    unverifiedFactorId: unverified?.id ?? null,
  };
}

/**
 * Returns true when the current session needs to step up via MFA.
 *
 * Two cases:
 *   1. The user has a verified factor but their session is still aal1
 *      (just signed in via OTP/password and hasn't challenged yet).
 *   2. The DSO has require_mfa = true AND the user isn't aal2 yet.
 */
export async function userNeedsMfaChallenge(
  supabase: SupabaseClient,
  options: { dsoRequiresMfa?: boolean } = {}
): Promise<boolean> {
  const state = await getMfaState(supabase);
  if (state.currentLevel === "aal2") return false;
  if (state.isEnrolled) return true;
  if (options.dsoRequiresMfa) return true;
  return false;
}
