/**
 * /admin/candidate/[id] — Candidate Account 360 (Tranche 1, Phase 3).
 *
 * Operator view (Tier-1 read; layout gates admin_users). Read-only. The view is
 * audited, but the audit metadata carries NO PII (id only, generic summary) per
 * §4. EEO is NEVER selected or rendered. Soft-deleted candidate → not-found.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getCandidateAccount } from "@/lib/admin/account-360";
import {
  BackLink,
  Panel,
  Row,
  HealthChips,
  fmtDate,
} from "@/components/admin/account-360-ui";

export const metadata: Metadata = {
  title: "Candidate · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CandidateAccount360({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getCandidateAccount(id);
  if (!c) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "admin.account.viewed",
      targetType: "candidate",
      targetId: c.id,
      summary: "Viewed candidate account", // no PII in the audit
    });
  }

  return (
    <>
      <BackLink />
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
          {c.fullName ?? "(no name)"}
        </h1>
        {c.currentTitle && (
          <p className="mt-1 text-[14px] text-slate-body">{c.currentTitle}</p>
        )}
      </header>

      <HealthChips flags={c.health} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Identity">
          <Row k="Email" v={c.email ?? "—"} />
          <Row k="Location" v={c.location ?? "—"} />
          <Row k="Joined" v={fmtDate(c.createdAt)} />
        </Panel>

        <Panel title="Status">
          <Row k="Searchable" v={c.isSearchable ? "Yes" : "No"} />
          <Row k="Anonymous mode" v={c.anonymousMode ? "On" : "Off"} />
          <Row k="Applications" v={String(c.applicationsCount)} />
        </Panel>
      </div>

      <p className="mt-8 text-[11px] text-slate-meta leading-relaxed">
        Operator view. EEO responses are never shown here. Quick-actions for
        candidates are out of scope this tranche.
      </p>
    </>
  );
}
