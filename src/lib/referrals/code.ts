/**
 * Referral-code helper (gap N15). Server-only — uses the service-role
 * client because `dsos` updates are admin-gated by RLS, and the code is a
 * harmless public token any teammate should be able to mint.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Unambiguous base32 alphabet (no 0/O/1/I/L) for legible shareable codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Return the DSO's referral code, generating + persisting one if absent.
 * Idempotent; retries on the (vanishingly rare) unique collision.
 */
export async function ensureReferralCode(dsoId: string): Promise<string | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: existing } = await admin
    .from("dsos")
    .select("referral_code")
    .eq("id", dsoId)
    .maybeSingle();
  const current = (existing?.referral_code as string | null) ?? null;
  if (current) return current;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await admin
      .from("dsos")
      .update({ referral_code: code })
      .eq("id", dsoId)
      .is("referral_code", null);
    if (!error) {
      // Re-read to confirm (another request may have won the race).
      const { data } = await admin
        .from("dsos")
        .select("referral_code")
        .eq("id", dsoId)
        .maybeSingle();
      const saved = (data?.referral_code as string | null) ?? null;
      if (saved) return saved;
    }
  }
  return null;
}

/** Resolve a DSO (+ active jobs) from a public referral code. Service-role. */
export async function lookupDsoByReferralCode(code: string): Promise<{
  dsoId: string;
  dsoName: string;
  jobs: Array<{ id: string; title: string }>;
} | null> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(clean)) return null;
  const admin = createSupabaseServiceRoleClient();
  const { data: dso } = await admin
    .from("dsos")
    .select("id, name, status, deleted_at")
    .eq("referral_code", clean)
    .maybeSingle();
  if (!dso || (dso.status as string) !== "active" || dso.deleted_at) return null;

  const { data: jobs } = await admin
    .from("jobs")
    .select("id, title")
    .eq("dso_id", dso.id as string)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false })
    .limit(50);

  return {
    dsoId: dso.id as string,
    dsoName: dso.name as string,
    jobs: ((jobs ?? []) as Array<{ id: string; title: string }>).map((j) => ({
      id: j.id,
      title: j.title,
    })),
  };
}
