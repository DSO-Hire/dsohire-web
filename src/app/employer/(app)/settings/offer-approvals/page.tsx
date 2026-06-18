/**
 * /employer/settings/offer-approvals — N12 Phase 2 policy + per-teammate
 * grants. Owner/admin only. Lives in the settings layout (left-rail IA).
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseOfferApprovals } from "@/lib/offers/approval-tier";
import { parseOfferApprovalPolicy } from "@/lib/offers/approval-policy";
import { can } from "@/lib/permissions/capabilities";
import {
  OfferApprovalsSettings,
  type TeammateRow,
} from "./offer-approvals-settings";

export const dynamic = "force-dynamic";

export default async function OfferApprovalsSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: me } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) redirect("/employer/onboarding");
  const dsoId = me.dso_id as string;
  const role = me.role as string;
  if (role !== "owner" && role !== "admin") redirect("/employer/settings");

  const approvalsEnabled = await dsoCanUseOfferApprovals(supabase, dsoId);

  const { data: dsoRow } = await supabase
    .from("dsos")
    .select("offer_approval_policy")
    .eq("id", dsoId)
    .maybeSingle();
  const policy = parseOfferApprovalPolicy(
    (dsoRow as Record<string, unknown> | null)?.offer_approval_policy
  );

  const { data: teamRows } = await supabase
    .from("dso_users")
    .select("id, full_name, first_name, last_name, role, permission_overrides")
    .eq("dso_id", dsoId)
    .order("role", { ascending: true })
    .order("first_name", { ascending: true });

  const teammates: TeammateRow[] = ((teamRows as Array<Record<string, unknown>> | null) ?? []).map(
    (t) => ({
      id: t.id as string,
      name:
        ((t.full_name as string | null) ??
          [t.first_name as string | null, t.last_name as string | null]
            .filter(Boolean)
            .join(" ")) ||
        "Teammate",
      role: t.role as string,
      // #83 Phase 2 — read the grant from the capability model (the legacy
      // can_send_offers_directly column is dead).
      canSendDirectly: can(
        t.role as string,
        t.permission_overrides,
        "offers.send_direct"
      ),
    })
  );

  return (
    <OfferApprovalsSettings
      approvalsEnabled={approvalsEnabled}
      policy={policy}
      teammates={teammates}
    />
  );
}
