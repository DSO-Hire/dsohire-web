/**
 * /employer/offer-approvals — N12 Phase 2 approvals queue.
 *
 * Owner/admin only. Lists every offer currently held for sign-off across
 * the DSO, oldest first, with Approve / Reject inline. Approving dispatches
 * the held letter to the candidate; rejecting returns it to the sender with
 * a note. Both live in offer-approval-actions.ts.
 */

import { redirect } from "next/navigation";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseOfferApprovals } from "@/lib/offers/approval-tier";
import { diffOffers } from "@/lib/offers/diff";
import { OfferApprovalsManager, type PendingOffer } from "./offer-approvals-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Offer approvals" };

export default async function OfferApprovalsPage() {
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
  if (role !== "owner" && role !== "admin") redirect("/employer/dashboard");

  const approvalsEnabled = await dsoCanUseOfferApprovals(supabase, dsoId);

  const { data: rawPending } = await supabase
    .from("application_offer_sends")
    .select(
      "id, application_id, subject, body_html, base_amount, base_period, merge_values, revised_from_offer_send_id, sent_at, sent_by_user_id, " +
        "applications:applications(id, candidate:candidates(full_name), job:jobs(title))"
    )
    .eq("approval_status", "pending")
    .order("sent_at", { ascending: true });

  type RawRow = {
    id: string;
    application_id: string;
    subject: string;
    body_html: string;
    base_amount: number | null;
    base_period: string | null;
    merge_values: Record<string, string> | null;
    revised_from_offer_send_id: string | null;
    sent_at: string;
    sent_by_user_id: string | null;
    applications:
      | {
          id: string;
          candidate: { full_name: string | null } | Array<{ full_name: string | null }> | null;
          job: { title: string | null } | Array<{ title: string | null }> | null;
        }
      | Array<{
          id: string;
          candidate: { full_name: string | null } | Array<{ full_name: string | null }> | null;
          job: { title: string | null } | Array<{ title: string | null }> | null;
        }>
      | null;
  };
  const rows = (rawPending ?? []) as unknown as RawRow[];

  // Resolve sender display names (batch).
  const senderAuthIds = Array.from(
    new Set(rows.map((r) => r.sent_by_user_id).filter((v): v is string => !!v))
  );
  const senderNameByAuthId = new Map<string, string>();
  if (senderAuthIds.length > 0) {
    const { data: senderRows } = await supabase
      .from("dso_users")
      .select("auth_user_id, full_name")
      .in("auth_user_id", senderAuthIds)
      .eq("dso_id", dsoId);
    for (const s of (senderRows ?? []) as Array<{ auth_user_id: string; full_name: string | null }>) {
      if (s.full_name) senderNameByAuthId.set(s.auth_user_id, s.full_name);
    }
  }

  // N12 Phase 3 — load each pending offer's predecessor so the queue can show
  // the "what changed" diff before the approver acts.
  const predecessorIds = Array.from(
    new Set(
      rows.map((r) => r.revised_from_offer_send_id).filter((v): v is string => !!v)
    )
  );
  const predecessorById = new Map<
    string,
    { base_amount: number | null; base_period: "hourly" | "annual" | null; merge_values: Record<string, string> | null; sent_at: string }
  >();
  if (predecessorIds.length > 0) {
    const { data: preds } = await supabase
      .from("application_offer_sends")
      .select("id, base_amount, base_period, merge_values, sent_at")
      .in("id", predecessorIds);
    for (const p of (preds ?? []) as Array<Record<string, unknown>>) {
      predecessorById.set(p.id as string, {
        base_amount: (p.base_amount as number | null) ?? null,
        base_period: (p.base_period as "hourly" | "annual" | null) ?? null,
        merge_values: (p.merge_values as Record<string, string> | null) ?? null,
        sent_at: p.sent_at as string,
      });
    }
  }

  const pending: PendingOffer[] = rows.map((r) => {
    const appRel = Array.isArray(r.applications) ? r.applications[0] ?? null : r.applications;
    const candRel = appRel?.candidate;
    const cand = Array.isArray(candRel) ? candRel[0] ?? null : candRel;
    const jobRel = appRel?.job;
    const job = Array.isArray(jobRel) ? jobRel[0] ?? null : jobRel;
    const pred = r.revised_from_offer_send_id
      ? predecessorById.get(r.revised_from_offer_send_id) ?? null
      : null;
    const changes = pred
      ? diffOffers(
          { base_amount: pred.base_amount, base_period: pred.base_period, merge_values: pred.merge_values },
          { base_amount: r.base_amount, base_period: (r.base_period as "hourly" | "annual" | null) ?? null, merge_values: r.merge_values }
        )
      : [];
    return {
      id: r.id,
      applicationId: r.application_id,
      candidateName: cand?.full_name ?? "the candidate",
      jobTitle: job?.title ?? "the role",
      subject: r.subject,
      bodyHtml: r.body_html,
      baseAmount: r.base_amount,
      basePeriod: (r.base_period as "hourly" | "annual" | null) ?? null,
      submittedAt: r.sent_at,
      senderName: r.sent_by_user_id
        ? senderNameByAuthId.get(r.sent_by_user_id) ?? null
        : null,
      changes,
      revisedFromDate: pred ? new Date(pred.sent_at).toLocaleDateString() : null,
    };
  });

  return (
    <EmployerShell active="offer-approvals">
      <OfferApprovalsManager pending={pending} approvalsEnabled={approvalsEnabled} />
    </EmployerShell>
  );
}
