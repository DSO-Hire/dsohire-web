"use server";

/**
 * /employer/settings/affiliation server actions.
 *
 * Updates the DSO's affiliation_reveal_policy. RLS already restricts
 * dsos.update to owner/admin DSO members for their own DSO; this action
 * shapes errors for the form rather than relying on a raw RLS deny.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";

export type AffiliationRevealPolicy =
  | "never"
  | "after_hire"
  | "per_application";

export interface AffiliationActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const VALID_POLICIES = new Set<AffiliationRevealPolicy>([
  "never",
  "after_hire",
  "per_application",
]);

// Audit-summary copy for policy values.
const POLICY_LABEL: Record<AffiliationRevealPolicy, string> = {
  never: "Never",
  after_hire: "After hire",
  per_application: "Per application",
};

export async function updateAffiliationRevealPolicy(
  _prev: AffiliationActionState,
  formData: FormData
): Promise<AffiliationActionState> {
  const policyRaw = String(formData.get("policy") ?? "").trim();
  if (!VALID_POLICIES.has(policyRaw as AffiliationRevealPolicy)) {
    return {
      ok: false,
      error: "Pick one of the three reveal options before saving.",
    };
  }
  const policy = policyRaw as AffiliationRevealPolicy;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership." };
  if (dsoUser.role !== "owner" && dsoUser.role !== "admin") {
    return {
      ok: false,
      error: "Only owners and admins can change the affiliation policy.",
    };
  }

  // Read prior value so the audit summary can show "Never → Per
  // application" or similar.
  const { data: priorRow } = await supabase
    .from("dsos")
    .select("affiliation_reveal_policy")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();
  const priorPolicy =
    (priorRow?.affiliation_reveal_policy as AffiliationRevealPolicy | null) ??
    null;

  const { error } = await supabase
    .from("dsos")
    .update({ affiliation_reveal_policy: policy })
    .eq("id", dsoUser.dso_id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Audit log (Phase 4.5.e).
  if (priorPolicy !== policy) {
    void recordAuditEvent({
      dsoId: dsoUser.dso_id as string,
      actorUserId: user.id,
      eventKind: "settings.affiliation_policy_changed",
      targetTable: "dsos",
      targetId: dsoUser.dso_id as string,
      summary: `Changed affiliation reveal policy from ${POLICY_LABEL[priorPolicy ?? "never"]} to ${POLICY_LABEL[policy]}`,
      metadata: { from: priorPolicy, to: policy },
    });
  }

  // Affiliation policy changes affect candidate-facing render paths
  // immediately. Bust their caches so the next render reflects the
  // new policy.
  revalidatePath("/employer/settings/affiliation");
  revalidatePath("/candidate/applications", "page");
  revalidatePath("/candidate/dashboard");
  return { ok: true, message: "Saved." };
}
